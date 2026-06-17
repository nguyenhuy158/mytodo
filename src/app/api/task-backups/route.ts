import {
  createSheetBackupSnapshot,
  getSheetTasks,
  restoreSheetBackupSnapshot,
  SheetConfigError,
} from "@/lib/google-sheets";
import {
  listTaskBackups,
  readTaskBackup,
  saveTaskBackup,
  TaskBackupStorageError,
  toTaskBackupSummary,
} from "@/lib/task-backups";
import { auth } from "@/auth";
import { isEmailAllowed } from "@/lib/auth-config";
import type { TaskBackupMutationPayload, TaskBackupsPayload } from "@/lib/tasks";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RESTORE_CONFIRMATION = "RESTORE";

class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export async function GET() {
  try {
    const authError = await getTaskBackupAuthErrorResponse();

    if (authError) {
      return authError;
    }

    return backupsResponse({
      backups: await listTaskBackups(),
    });
  } catch (error) {
    return backupErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await getTaskBackupAuthErrorResponse();

    if (authError) {
      return authError;
    }

    const payload = await readJson(request);
    const action = parseAction(payload);

    if (action === "create") {
      return createBackupResponse(payload);
    }

    return restoreBackupResponse(payload);
  } catch (error) {
    return backupErrorResponse(error);
  }
}

async function createBackupResponse(payload: unknown) {
  const snapshot = await createSheetBackupSnapshot();
  const backup = await saveTaskBackup(snapshot, getOptionalString(payload, "note"));

  return backupMutationResponse({
    backup,
    backups: await listTaskBackups(),
  });
}

async function restoreBackupResponse(payload: unknown) {
  const backupId = getRequiredString(payload, "backupId");
  const confirmation = getRequiredString(payload, "confirmation");

  if (confirmation !== RESTORE_CONFIRMATION) {
    throw new RequestValidationError("Nhập RESTORE để xác nhận restore.");
  }

  const backup = await readTaskBackup(backupId);
  const safetySnapshot = await createSheetBackupSnapshot();
  const safetyBackup = await saveTaskBackup(
    safetySnapshot,
    `Auto backup before restoring ${backup.id}`,
  );

  await restoreSheetBackupSnapshot(backup);

  return backupMutationResponse({
    backup: toTaskBackupSummary(backup),
    safetyBackup,
    backups: await listTaskBackups(),
    tasksPayload: await getSheetTasks({ forceRefresh: true }),
  });
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

async function getTaskBackupAuthErrorResponse() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return backupAuthErrorResponse(
      "AUTH_REQUIRED",
      "Bạn cần đăng nhập bằng Google.",
      401,
    );
  }

  if (!isEmailAllowed(email)) {
    return backupAuthErrorResponse(
      "AUTH_FORBIDDEN",
      "Email này không được phép xem dữ liệu.",
      403,
    );
  }

  return null;
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

function backupErrorResponse(error: unknown) {
  const isValidationError = error instanceof RequestValidationError;
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
