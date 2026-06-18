import { auth } from "@/auth";
import { isEmailAllowed } from "@/lib/auth-config";
import { getSheetRuntimeInfo } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const authResult = await getSheetInfoAuthResult();

  if ("response" in authResult) {
    return authResult.response;
  }

  return Response.json(getSheetRuntimeInfo(), {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

async function getSheetInfoAuthResult() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return {
      response: sheetInfoAuthErrorResponse(
        "AUTH_REQUIRED",
        "Bạn cần đăng nhập bằng Google.",
        401,
      ),
    };
  }

  if (!isEmailAllowed(email)) {
    return {
      response: sheetInfoAuthErrorResponse(
        "AUTH_FORBIDDEN",
        "Email này không được phép xem cấu hình Sheet.",
        403,
      ),
    };
  }

  return { email };
}

function sheetInfoAuthErrorResponse(code: string, message: string, status: number) {
  return Response.json(
    {
      error: {
        code,
        message,
      },
      sheet: null,
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
