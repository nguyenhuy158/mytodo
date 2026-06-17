import { auth } from "@/auth";
import { createWeekSummaryApplicationService } from "@/infrastructure/app-services";
import { isEmailAllowed } from "@/lib/auth-config";
import {
  GeminiConfigError,
  GeminiRequestError,
} from "@/lib/gemini";
import { SheetConfigError } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const authError = await getAiAuthErrorResponse();

    if (authError) {
      return authError;
    }

    const summaryPayload =
      await createWeekSummaryApplicationService().summarizeCurrentWeek();

    return Response.json(summaryPayload, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return aiSummaryErrorResponse(error);
  }
}

async function getAiAuthErrorResponse() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return aiSummaryAuthErrorResponse(
      "AUTH_REQUIRED",
      "Bạn cần đăng nhập bằng Google.",
      401,
    );
  }

  if (!isEmailAllowed(email)) {
    return aiSummaryAuthErrorResponse(
      "AUTH_FORBIDDEN",
      "Email này không được phép xem dữ liệu.",
      403,
    );
  }

  return null;
}

function aiSummaryAuthErrorResponse(
  code: string,
  message: string,
  status: number,
) {
  return Response.json(
    {
      error: {
        code,
        message,
      },
      meta: null,
      summary: null,
    },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}

function aiSummaryErrorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Không tạo được tóm tắt AI.";

  return Response.json(
    {
      error: {
        code: getAiSummaryErrorCode(error),
        message,
      },
      meta: null,
      summary: null,
    },
    {
      status: getAiSummaryErrorStatus(error),
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}

function getAiSummaryErrorCode(error: unknown) {
  if (error instanceof GeminiConfigError) {
    return "GEMINI_CONFIG_ERROR";
  }

  if (error instanceof GeminiRequestError) {
    return "GEMINI_REQUEST_ERROR";
  }

  if (error instanceof SheetConfigError) {
    return "SHEET_CONFIG_ERROR";
  }

  return "AI_WEEK_SUMMARY_ERROR";
}

function getAiSummaryErrorStatus(error: unknown) {
  if (error instanceof GeminiConfigError || error instanceof SheetConfigError) {
    return 503;
  }

  if (error instanceof GeminiRequestError) {
    return error.status === 429 ? 429 : 502;
  }

  return 500;
}
