import { timingSafeEqual } from "node:crypto";

import { createTaskApplicationService } from "@/infrastructure/app-services";
import { SheetConfigError } from "@/lib/google-sheets";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SECRET_HEADER = "x-task-webhook-secret";

export async function POST(request: NextRequest) {
  const secret = process.env.TASK_WEBHOOK_SECRET?.trim();

  if (!secret) {
    return webhookErrorResponse(
      "TASK_WEBHOOK_NOT_CONFIGURED",
      "Thiếu TASK_WEBHOOK_SECRET trên server.",
      503,
    );
  }

  if (!isValidSecret(request.headers.get(SECRET_HEADER), secret)) {
    return webhookErrorResponse(
      "TASK_WEBHOOK_UNAUTHORIZED",
      "Webhook secret không hợp lệ.",
      401,
    );
  }

  try {
    const payload = await createTaskApplicationService().listTasks({
      forceRefresh: true,
    });

    return Response.json(
      {
        ok: true,
        refreshedAt: payload.meta.updatedAt,
        taskCount: payload.tasks.length,
        cache: payload.meta.cache,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "X-Task-Cache": payload.meta.cache.status,
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Không refresh được Google Sheet.";

    return webhookErrorResponse(
      error instanceof SheetConfigError
        ? "SHEET_CONFIG_ERROR"
        : "TASK_WEBHOOK_REFRESH_ERROR",
      message,
      error instanceof SheetConfigError ? 503 : 500,
    );
  }
}

function webhookErrorResponse(code: string, message: string, status: number) {
  return Response.json(
    {
      ok: false,
      error: {
        code,
        message,
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

function isValidSecret(receivedSecret: string | null, expectedSecret: string) {
  if (!receivedSecret) {
    return false;
  }

  const received = Buffer.from(receivedSecret);
  const expected = Buffer.from(expectedSecret);

  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}
