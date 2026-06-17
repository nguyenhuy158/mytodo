import { auth } from "@/auth";
import {
  createTaskConfigApplicationService,
  createTaskHistoryApplicationService,
} from "@/infrastructure/app-services";
import { isEmailAllowed } from "@/lib/auth-config";
import { TaskConfigStorageError } from "@/lib/task-config";
import type {
  TaskConfigCategory,
  TaskConfigCreateInput,
  TaskConfigItem,
  TaskConfigUpdateInput,
  TaskConfigsPayload,
} from "@/lib/tasks";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONFIG_CATEGORIES: TaskConfigCategory[] = [
  "status",
  "priority",
  "system",
  "tags",
];

class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export async function GET() {
  try {
    const authResult = await getTaskConfigAuthResult();

    if ("response" in authResult) {
      return authResult.response;
    }

    return configResponse(
      await createTaskConfigApplicationService().listConfigs(),
    );
  } catch (error) {
    return configErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await getTaskConfigAuthResult();

    if ("response" in authResult) {
      return authResult.response;
    }

    const input = parseCreateInput(await readJson(request), authResult.email);

    const mutationPayload =
      await createTaskConfigApplicationService().createConfig(input);

    await recordConfigHistory(() =>
      createTaskHistoryApplicationService().recordConfigCreate({
        actorEmail: authResult.email,
        item: mutationPayload.item,
      }),
    );

    return configResponse(mutationPayload);
  } catch (error) {
    return configErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await getTaskConfigAuthResult();

    if ("response" in authResult) {
      return authResult.response;
    }

    const input = parseUpdateInput(await readJson(request), authResult.email);
    const beforeItem = await findConfigItem(input.id);
    const mutationPayload =
      await createTaskConfigApplicationService().updateConfig(input);

    await recordConfigHistory(() =>
      createTaskHistoryApplicationService().recordConfigUpdate({
        actorEmail: authResult.email,
        afterItem: mutationPayload.item,
        beforeItem,
      }),
    );

    return configResponse(mutationPayload);
  } catch (error) {
    return configErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await getTaskConfigAuthResult();

    if ("response" in authResult) {
      return authResult.response;
    }

    const id = getRequiredString(await readJson(request), "id");
    const beforeItem = await findConfigItem(id);
    const mutationPayload =
      await createTaskConfigApplicationService().deleteConfig({
        id,
        actorEmail: authResult.email,
      });

    await recordConfigHistory(() =>
      createTaskHistoryApplicationService().recordConfigDelete({
        actorEmail: authResult.email,
        item: beforeItem ?? mutationPayload.item,
      }),
    );

    return configResponse(mutationPayload);
  } catch (error) {
    return configErrorResponse(error);
  }
}

async function getTaskConfigAuthResult() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return {
      response: configAuthErrorResponse(
        "AUTH_REQUIRED",
        "Bạn cần đăng nhập bằng Google.",
        401,
      ),
    };
  }

  if (!isEmailAllowed(email)) {
    return {
      response: configAuthErrorResponse(
        "AUTH_FORBIDDEN",
        "Email này không được phép xem dữ liệu.",
        403,
      ),
    };
  }

  return { email };
}

async function findConfigItem(id: string) {
  const payload = await createTaskConfigApplicationService().listConfigs();

  return Object.values(payload.configs)
    .flat()
    .find((item: TaskConfigItem) => item.id === id);
}

async function recordConfigHistory(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    console.error("Task config history write failed", error);
  }
}

function configResponse(payload: TaskConfigsPayload | (TaskConfigsPayload & object)) {
  return Response.json(payload, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

function configAuthErrorResponse(code: string, message: string, status: number) {
  return Response.json(
    {
      error: {
        code,
        message,
      },
      configs: emptyConfigs(),
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

function configErrorResponse(error: unknown) {
  const isValidationError = error instanceof RequestValidationError;
  const isStorageError = error instanceof TaskConfigStorageError;
  const message =
    error instanceof Error ? error.message : "Không thao tác được config.";

  return Response.json(
    {
      error: {
        code: isValidationError
          ? "TASK_CONFIG_VALIDATION_ERROR"
          : isStorageError
            ? "TASK_CONFIG_STORAGE_ERROR"
            : "TASK_CONFIG_ERROR",
        message,
      },
      configs: emptyConfigs(),
      meta: null,
    },
    {
      status: isValidationError ? 400 : isStorageError ? 503 : 500,
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}

async function readJson(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    throw new RequestValidationError("JSON body không hợp lệ.");
  }
}

function parseCreateInput(
  payload: unknown,
  actorEmail: string,
): TaskConfigCreateInput {
  return {
    category: getCategory(payload),
    value: getRequiredString(payload, "value"),
    label: getOptionalString(payload, "label"),
    order: getOptionalOrder(payload, "order"),
    isActive: getOptionalBoolean(payload, "isActive"),
    actorEmail,
  };
}

function parseUpdateInput(
  payload: unknown,
  actorEmail: string,
): TaskConfigUpdateInput {
  if (!isRecord(payload)) {
    throw new RequestValidationError("Payload config phải là object.");
  }

  const updates = payload.updates;

  if (!isRecord(updates)) {
    throw new RequestValidationError("updates phải là object.");
  }

  const input: TaskConfigUpdateInput = {
    id: getRequiredString(payload, "id"),
    updates: {},
    actorEmail,
  };

  if ("value" in updates) {
    input.updates.value = getRequiredString(updates, "value");
  }

  if ("label" in updates) {
    input.updates.label = getOptionalString(updates, "label") ?? "";
  }

  if ("order" in updates) {
    input.updates.order = getOptionalOrder(updates, "order") ?? 0;
  }

  if ("isActive" in updates) {
    input.updates.isActive = getRequiredBoolean(updates, "isActive");
  }

  if (!Object.keys(input.updates).length) {
    throw new RequestValidationError("Không có field config để cập nhật.");
  }

  return input;
}

function getCategory(payload: unknown): TaskConfigCategory {
  const category = getRequiredString(payload, "category");

  if (!CONFIG_CATEGORIES.includes(category as TaskConfigCategory)) {
    throw new RequestValidationError("category không hợp lệ.");
  }

  return category as TaskConfigCategory;
}

function getRequiredString(payload: unknown, key: string) {
  if (!isRecord(payload)) {
    throw new RequestValidationError("Payload config phải là object.");
  }

  const value = payload[key];

  if (typeof value !== "string" || !value.trim()) {
    throw new RequestValidationError(`${key} không được để trống.`);
  }

  return value.trim();
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

function getOptionalOrder(payload: unknown, key: string) {
  if (!isRecord(payload)) {
    return undefined;
  }

  const value = payload[key];

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RequestValidationError(`${key} phải là số.`);
  }

  return Math.trunc(value);
}

function getOptionalBoolean(payload: unknown, key: string) {
  if (!isRecord(payload)) {
    return undefined;
  }

  const value = payload[key];

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return getRequiredBoolean(payload, key);
}

function getRequiredBoolean(payload: Record<string, unknown>, key: string) {
  const value = payload[key];

  if (typeof value !== "boolean") {
    throw new RequestValidationError(`${key} phải là boolean.`);
  }

  return value;
}

function emptyConfigs() {
  return {
    status: [],
    priority: [],
    system: [],
    tags: [],
  } satisfies Record<TaskConfigCategory, []>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
