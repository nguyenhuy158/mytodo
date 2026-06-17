import { auth } from "@/auth";
import { createTaskHistoryApplicationService } from "@/infrastructure/app-services";
import { isEmailAllowed } from "@/lib/auth-config";
import { TaskHistoryStorageError } from "@/lib/task-history";
import type { TaskHistoryPayload } from "@/lib/tasks";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_HISTORY_LIMIT = 100;
const MAX_HISTORY_LIMIT = 500;

export async function GET(request: NextRequest) {
  try {
    const authResult = await getTaskHistoryAuthResult();

    if ("response" in authResult) {
      return authResult.response;
    }

    const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
    const entries = await createTaskHistoryApplicationService().listHistory({
      limit,
    });

    return historyResponse({
      entries,
      meta: {
        limit,
        total: entries.length,
      },
    });
  } catch (error) {
    return historyErrorResponse(error);
  }
}

async function getTaskHistoryAuthResult() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return {
      response: historyAuthErrorResponse(
        "AUTH_REQUIRED",
        "Bạn cần đăng nhập bằng Google.",
        401,
      ),
    };
  }

  if (!isEmailAllowed(email)) {
    return {
      response: historyAuthErrorResponse(
        "AUTH_FORBIDDEN",
        "Email này không được phép xem dữ liệu.",
        403,
      ),
    };
  }

  return { email };
}

function historyResponse(payload: TaskHistoryPayload) {
  return Response.json(payload, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

function historyAuthErrorResponse(code: string, message: string, status: number) {
  return Response.json(
    {
      error: {
        code,
        message,
      },
      entries: [],
      meta: {
        limit: DEFAULT_HISTORY_LIMIT,
        total: 0,
      },
    },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}

function historyErrorResponse(error: unknown) {
  const isStorageError = error instanceof TaskHistoryStorageError;
  const message =
    error instanceof Error ? error.message : "Không đọc được history.";

  return Response.json(
    {
      error: {
        code: isStorageError ? "TASK_HISTORY_STORAGE_ERROR" : "TASK_HISTORY_ERROR",
        message,
      },
      entries: [],
      meta: {
        limit: DEFAULT_HISTORY_LIMIT,
        total: 0,
      },
    },
    {
      status: isStorageError ? 503 : 500,
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}

function parseLimit(value: string | null) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_HISTORY_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_HISTORY_LIMIT);
}
