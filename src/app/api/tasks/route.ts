import {
  createSheetTask,
  getSheetTasks,
  SheetConfigError,
  updateSheetTask,
} from "@/lib/google-sheets";
import { auth } from "@/auth";
import { isEmailAllowed } from "@/lib/auth-config";
import type {
  TaskCreateInput,
  TaskPriority,
  TaskStatus,
  TaskUpdateInput,
} from "@/lib/tasks";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TASK_STATUS_OPTIONS: TaskStatus[] = [
  "In Progress",
  "Not Started",
  "Done",
  "Blocked",
  "Unknown",
];
const TASK_PRIORITY_OPTIONS: TaskPriority[] = [
  "High",
  "Medium",
  "Low",
  "Unknown",
];
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export async function GET(request: NextRequest) {
  try {
    const authError = await getTaskAuthErrorResponse();

    if (authError) {
      return authError;
    }

    const forceRefresh = request.nextUrl.searchParams.get("force") === "1";
    const payload = await getSheetTasks({ forceRefresh });

    return taskResponse(payload);
  } catch (error) {
    return taskErrorResponse(error, "read");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authError = await getTaskAuthErrorResponse();

    if (authError) {
      return authError;
    }

    const input = parseTaskUpdateInput(await readJson(request));

    await updateSheetTask(input);

    const payload = await getSheetTasks({ forceRefresh: true });

    return taskResponse(payload);
  } catch (error) {
    return taskErrorResponse(error, "write");
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await getTaskAuthErrorResponse();

    if (authError) {
      return authError;
    }

    const input = parseTaskCreateInput(await readJson(request));

    await createSheetTask(input);

    const payload = await getSheetTasks({ forceRefresh: true });

    return taskResponse(payload);
  } catch (error) {
    return taskErrorResponse(error, "write");
  }
}

function taskResponse(payload: Awaited<ReturnType<typeof getSheetTasks>>) {
  return Response.json(payload, {
    headers: {
      "Cache-Control": "private, no-store",
      "X-Task-Cache": payload.meta.cache.status,
    },
  });
}

async function getTaskAuthErrorResponse() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return taskAuthErrorResponse(
      "AUTH_REQUIRED",
      "Bạn cần đăng nhập bằng Google.",
      401,
    );
  }

  if (!isEmailAllowed(email)) {
    return taskAuthErrorResponse(
      "AUTH_FORBIDDEN",
      "Email này không được phép xem dữ liệu.",
      403,
    );
  }

  return null;
}

function taskAuthErrorResponse(code: string, message: string, status: number) {
  return Response.json(
    {
      error: {
        code,
        message,
      },
      tasks: [],
      meta: null,
    },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}

function taskErrorResponse(error: unknown, action: "read" | "write") {
  const isConfigError = error instanceof SheetConfigError;
  const isValidationError = error instanceof RequestValidationError;
  const message =
    error instanceof Error ? error.message : "Không đọc được Google Sheet.";
  const now = new Date().toISOString();

  return Response.json(
    {
      error: {
        code: getErrorCode(action, isConfigError, isValidationError),
        message,
      },
      tasks: [],
      meta: {
        updatedAt: now,
        sheetTitle: "",
        range: "",
        spreadsheetId: "",
        pollingMs: 15_000,
        cache: {
          status: "miss",
          cachedAt: now,
          expiresAt: now,
          ttlMs: 0,
          ageMs: 0,
        },
      },
    },
    {
      status: getErrorStatus(isConfigError, isValidationError),
      headers: {
        "Cache-Control": "private, no-store",
        "X-Task-Cache": "error",
      },
    },
  );
}

function getErrorCode(
  action: "read" | "write",
  isConfigError: boolean,
  isValidationError: boolean,
) {
  if (isValidationError) {
    return "TASK_WRITE_VALIDATION_ERROR";
  }

  if (isConfigError) {
    return "SHEET_CONFIG_ERROR";
  }

  return action === "write" ? "SHEET_WRITE_ERROR" : "SHEET_READ_ERROR";
}

function getErrorStatus(isConfigError: boolean, isValidationError: boolean) {
  if (isValidationError) {
    return 400;
  }

  return isConfigError ? 503 : 500;
}

async function readJson(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    throw new RequestValidationError("JSON body không hợp lệ.");
  }
}

function parseTaskCreateInput(payload: unknown): TaskCreateInput {
  if (!isRecord(payload)) {
    throw new RequestValidationError("Payload tạo task phải là object.");
  }

  const task = getRequiredString(payload, "task");

  return {
    tags: getOptionalString(payload, "tags"),
    system: getOptionalString(payload, "system"),
    task,
    details: getOptionalString(payload, "details"),
    priority: getOptionalPriority(payload, "priority") ?? "Medium",
    status: getOptionalStatus(payload, "status") ?? "Not Started",
    dateReceived:
      getOptionalISODate(payload, "dateReceived") ?? getTodayISODate(),
    deadline: getOptionalISODate(payload, "deadline"),
    actualDate: getOptionalISODate(payload, "actualDate"),
    note: getOptionalString(payload, "note"),
  };
}

function parseTaskUpdateInput(payload: unknown): TaskUpdateInput {
  if (!isRecord(payload)) {
    throw new RequestValidationError("Payload cập nhật phải là object.");
  }

  const rowNumber = payload.rowNumber;

  if (
    typeof rowNumber !== "number" ||
    !Number.isInteger(rowNumber) ||
    rowNumber < 1
  ) {
    throw new RequestValidationError("rowNumber phải là số nguyên dương.");
  }

  const rawUpdates = payload.updates;

  if (!isRecord(rawUpdates)) {
    throw new RequestValidationError("updates phải là object.");
  }

  const updates: TaskUpdateInput["updates"] = {};

  if ("status" in rawUpdates) {
    if (!isTaskStatus(rawUpdates.status)) {
      throw new RequestValidationError("status không hợp lệ.");
    }

    updates.status = rawUpdates.status;
  }

  if ("priority" in rawUpdates) {
    if (!isTaskPriority(rawUpdates.priority)) {
      throw new RequestValidationError("priority không hợp lệ.");
    }

    updates.priority = rawUpdates.priority;
  }

  if ("actualDate" in rawUpdates) {
    if (!isOptionalISODate(rawUpdates.actualDate)) {
      throw new RequestValidationError(
        "actualDate phải rỗng hoặc theo format YYYY-MM-DD.",
      );
    }

    updates.actualDate = rawUpdates.actualDate;
  }

  if ("note" in rawUpdates) {
    if (typeof rawUpdates.note !== "string") {
      throw new RequestValidationError("note phải là chuỗi.");
    }

    updates.note = rawUpdates.note;
  }

  if (!Object.keys(updates).length) {
    throw new RequestValidationError("Không có field hợp lệ để cập nhật.");
  }

  return {
    rowNumber,
    updates,
  };
}

function getRequiredString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];

  if (typeof value !== "string" || !value.trim()) {
    throw new RequestValidationError(`${key} không được để trống.`);
  }

  return value.trim();
}

function getOptionalString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new RequestValidationError(`${key} phải là chuỗi.`);
  }

  return value.trim();
}

function getOptionalPriority(payload: Record<string, unknown>, key: string) {
  const value = payload[key];

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (!isTaskPriority(value)) {
    throw new RequestValidationError(`${key} không hợp lệ.`);
  }

  return value;
}

function getOptionalStatus(payload: Record<string, unknown>, key: string) {
  const value = payload[key];

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (!isTaskStatus(value)) {
    throw new RequestValidationError(`${key} không hợp lệ.`);
  }

  return value;
}

function getOptionalISODate(payload: Record<string, unknown>, key: string) {
  const value = payload[key];

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (!isOptionalISODate(value)) {
    throw new RequestValidationError(
      `${key} phải rỗng hoặc theo format YYYY-MM-DD.`,
    );
  }

  return value.trim();
}

function getTodayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === "string" &&
    TASK_STATUS_OPTIONS.includes(value as TaskStatus)
  );
}

function isTaskPriority(value: unknown): value is TaskPriority {
  return (
    typeof value === "string" &&
    TASK_PRIORITY_OPTIONS.includes(value as TaskPriority)
  );
}

function isOptionalISODate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (value.trim() === "" || ISO_DATE_PATTERN.test(value))
  );
}
