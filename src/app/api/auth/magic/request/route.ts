import { NextResponse } from "next/server";
import {
  createMagicLoginUrl,
  sendMagicLoginEmail,
} from "@/lib/magic-link";
import {
  getSafeRedirectPath,
  isValidEmail,
  normalizeEmail,
} from "@/lib/magic-token";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const email = normalizeEmail(typeof payload?.email === "string" ? payload.email : "");
  const redirectTo = getSafeRedirectPath(
    typeof payload?.redirectTo === "string" ? payload.redirectTo : "/",
  );

  if (!isValidEmail(email)) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_EMAIL",
          message: "Email không hợp lệ.",
        },
      },
      { status: 400 },
    );
  }

  const loginUrl = createMagicLoginUrl({
    email,
    redirectTo,
    requestUrl: request.url,
  });
  const result = await sendMagicLoginEmail({
    email,
    loginUrl,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          code: result.code,
          message: result.message,
        },
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Nếu email được cấp quyền, link đăng nhập đã được gửi.",
  });
}
