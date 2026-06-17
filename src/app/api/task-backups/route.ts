import { auth } from "@/auth";
import { TaskBackupValidationError } from "@/application/task-backups/task-backup-service";
import {
  createTaskBackupApplicationService,
  createTaskHistoryApplicationService,
} from "@/infrastructure/app-services";
import { isEmailAllowed } from "@/lib/auth-config";
import { SheetConfigError } from "@/lib/google-sheets";
import { TaskBackupStorageError } from "@/lib/task-backups";
import type { TaskBackupMutationPayload, TaskBackupsPayload } from "@/lib/tasks";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export async function GET() {
  try {
    const authResult = await getTaskBackupAuthResult();

    if ("response" in authResult) {
      return authResult.response;
    }

    return backupsResponse({
      backups: await createTaskBackupApplicationService().listBackups(),
    });
  } catch (error) {
    return backupErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await getTaskBackupAuthResult();

    if ("response" in authResult) {
      return authResult.response;
    }

    const payload = await readJson(request);
    const action = parseAction(payload);

    if (action === "create") {
      return createBackupResponse(payload, authResult.email);
    }

    return restoreBackupResponse(payload, authResult.email);
  } catch (error) {
    return backupErrorResponse(error);
  }
}

async function createBackupResponse(payload: unknown, actorEmail: string) {
  const mutationPayload = await createTaskBackupApplicationService().createBackup(
    getOptionalString(payload, "note"),
  );

  await recordBackupHistory(() =>
    createTaskHistoryApplicationService().recordBackupCreate({
      actorEmail,
      backup: mutationPayload.backup,
    }),
  );

  return backupMutationResponse(mutationPayload);
}

async function restoreBackupResponse(payload: unknown, actorEmail: string) {
  const backupId = getRequiredString(payload, "backupId");
  const confirmation = getRequiredString(payload, "confirmation");
  const mutationPayload = await createTaskBackupApplicationService().restoreBackup({
    backupId,
    confirmation,
  });

  await recordBackupHistory(() =>
    createTaskHistoryApplicationService().recordBackupRestore({
      actorEmail,
      backup: mutationPayload.backup,
      safetyBackup: mutationPayload.safetyBackup,
    }),
  );

  return backupMutationResponse(mutationPayload);
}

function backupsResponse(payload: TaskBackupsPayload) {
  return Response.json(payload, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

function backupMutationResponse(payload: TaskBackupMutationPayload) {
  return Response.json(payload, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

async function getTaskBackupAuthResult() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return {
      response: backupAuthErrorResponse(
        "AUTH_REQUIRED",
        "Bạn cần đăng nhập bằng Google.",
        401,
      ),
    };
  }

  if (!isEmailAllowed(email)) {
    return {
      response: backupAuthErrorResponse(
        "AUTH_FORBIDDEN",
        "Email này không được phép xem dữ liệu.",
        403,
      ),
    };
  }

  return { email };
}

function backupAuthErrorResponse(code: string, message: string, status: number) {
  return Response.json(
    {
      error: {
        code,
        message,
      },
      backups: [],
    },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}

async function recordBackupHistory(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    console.error("Task backup history write failed", error);
  }
}

function backupErrorResponse(error: unknown) {
  const isValidationError =
    error instanceof RequestValidationError ||
    error instanceof TaskBackupValidationError;
  const isConfigError = error instanceof SheetConfigError;
  const isStorageError = error instanceof TaskBackupStorageError;
  const message =
    error instanceof Error ? error.message : "Không thao tác được backup.";

  return Response.json(
    {
      error: {
        code: getErrorCode(isValidationError, isConfigError, isStorageError),
        message,
      },
      backups: [],
    },
    {
      status: getErrorStatus(isValidationError, isConfigError, isStorageError),
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}

function getErrorCode(
  isValidationError: boolean,
  isConfigError: boolean,
  isStorageError: boolean,
) {
  if (isValidationError) {
    return "BACKUP_VALIDATION_ERROR";
  }

  if (isConfigError) {
    return "SHEET_CONFIG_ERROR";
  }

  return isStorageError ? "BACKUP_STORAGE_ERROR" : "BACKUP_ERROR";
}

function getErrorStatus(
  isValidationError: boolean,
  isConfigError: boolean,
  isStorageError: boolean,
) {
  if (isValidationError) {
    return 400;
  }

  if (isConfigError) {
    return 503;
  }

  return isStorageError ? 404 : 500;
}

async function readJson(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    throw new RequestValidationError("JSON body không hợp lệ.");
  }
}

function parseAction(payload: unknown) {
  const action = getRequiredString(payload, "action");

  if (action !== "create" && action !== "restore") {
    throw new RequestValidationError("action phải là create hoặc restore.");
  }

  return action;
}

function getOptionalString(payload: unknown, key: string) {
  if (!isRecord(payload)) {
    return undefined;
  }

  const value = payload[key];

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new RequestValidationError(`${key} phải là chuỗi.`);
  }

  return value.trim();
}

function getRequiredString(payload: unknown, key: string) {
  if (!isRecord(payload)) {
    throw new RequestValidationError("Payload backup phải là object.");
  }

  const value = payload[key];

  if (typeof value !== "string" || !value.trim()) {
    throw new RequestValidationError(`${key} không được để trống.`);
  }

  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
