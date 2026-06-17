import { auth } from "@/auth";
import { createTaskChatApplicationService } from "@/infrastructure/app-services";
import { isEmailAllowed } from "@/lib/auth-config";
import {
  GeminiConfigError,
  GeminiRequestError,
} from "@/lib/gemini";
import { SheetConfigError } from "@/lib/google-sheets";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await getAiChatAuthErrorResponse();

    if (authError) {
      return authError;
    }

    const question = getQuestion(await readJson(request));
    const payload =
      await createTaskChatApplicationService().answerQuestion(question);

    return Response.json(payload, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return aiChatErrorResponse(error);
  }
}

async function getAiChatAuthErrorResponse() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return aiChatAuthErrorResponse(
      "AUTH_REQUIRED",
      "Bạn cần đăng nhập bằng Google.",
      401,
    );
  }

  if (!isEmailAllowed(email)) {
    return aiChatAuthErrorResponse(
      "AUTH_FORBIDDEN",
      "Email này không được phép xem dữ liệu.",
      403,
    );
  }

  return null;
}

function aiChatAuthErrorResponse(code: string, message: string, status: number) {
  return Response.json(
    {
      error: {
        code,
        message,
      },
      answer: "",
      meta: null,
      relatedTasks: [],
      suggestedNextActions: [],
    },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}

function aiChatErrorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Không hỏi được Gemini.";

  return Response.json(
    {
      error: {
        code: getAiChatErrorCode(error),
        message,
      },
      answer: "",
      meta: null,
      relatedTasks: [],
      suggestedNextActions: [],
    },
    {
      status: getAiChatErrorStatus(error),
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}

function getAiChatErrorCode(error: unknown) {
  if (error instanceof RequestValidationError) {
    return "AI_CHAT_VALIDATION_ERROR";
  }

  if (error instanceof GeminiConfigError) {
    return "GEMINI_CONFIG_ERROR";
  }

  if (error instanceof GeminiRequestError) {
    return "GEMINI_REQUEST_ERROR";
  }

  if (error instanceof SheetConfigError) {
    return "SHEET_CONFIG_ERROR";
  }

  return "AI_CHAT_ERROR";
}

function getAiChatErrorStatus(error: unknown) {
  if (error instanceof RequestValidationError) {
    return 400;
  }

  if (error instanceof GeminiConfigError || error instanceof SheetConfigError) {
    return 503;
  }

  if (error instanceof GeminiRequestError) {
    return error.status === 429 ? 429 : 502;
  }

  return 500;
}

async function readJson(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    throw new RequestValidationError("JSON body không hợp lệ.");
  }
}

function getQuestion(payload: unknown) {
  if (!isRecord(payload)) {
    throw new RequestValidationError("Payload chat phải là object.");
  }

  const question = payload.question;

  if (typeof question !== "string" || question.trim().length < 3) {
    throw new RequestValidationError("Câu hỏi phải có ít nhất 3 ký tự.");
  }

  if (question.trim().length > 700) {
    throw new RequestValidationError("Câu hỏi tối đa 700 ký tự.");
  }

  return question.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
