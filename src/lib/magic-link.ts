import "server-only";

import { isEmailAllowed } from "@/lib/auth-config";
import {
  createMagicLoginToken,
  getMagicLinkTtlMinutes,
} from "@/lib/magic-token";

const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";
const RESEND_USER_AGENT = "mytodo/0.1.0";

export type MagicLinkSendResult =
  | { ok: true; skipped?: false }
  | { ok: true; skipped: true }
  | {
      ok: false;
      code: "EMAIL_NOT_CONFIGURED" | "EMAIL_SEND_FAILED";
      message: string;
    };

type ResendConfig = {
  apiKey: string;
  from: string;
};

export function isMagicLinkEnabled() {
  return getResendConfig() !== null;
}

export function createMagicLoginUrl({
  email,
  redirectTo,
  requestUrl,
}: {
  email: string;
  redirectTo: string;
  requestUrl: string;
}) {
  const baseUrl = getPublicBaseUrl(requestUrl);
  const url = new URL("/api/auth/magic/callback", baseUrl);

  url.searchParams.set(
    "token",
    createMagicLoginToken({
      email,
      redirectTo,
    }),
  );

  return url.toString();
}

export async function sendMagicLoginEmail({
  email,
  loginUrl,
}: {
  email: string;
  loginUrl: string;
}): Promise<MagicLinkSendResult> {
  if (!isEmailAllowed(email)) {
    return { ok: true, skipped: true };
  }

  const resendConfig = getResendConfig();

  if (!resendConfig) {
    return {
      ok: false,
      code: "EMAIL_NOT_CONFIGURED",
      message: "Chưa cấu hình Resend để gửi magic link.",
    };
  }

  try {
    const host = new URL(loginUrl).host;
    const ttlMinutes = getMagicLinkTtlMinutes();
    const subject = "Đăng nhập 2026 Tasks";
    const text = [
      subject,
      "",
      `Mở link này để đăng nhập: ${loginUrl}`,
      "",
      `Link hết hạn sau ${ttlMinutes} phút.`,
      `Nếu bạn không yêu cầu đăng nhập ${host}, bỏ qua email này.`,
    ].join("\n");
    const html = [
      '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">',
      "<h2>Đăng nhập 2026 Tasks</h2>",
      `<p>Bấm nút bên dưới để đăng nhập. Link hết hạn sau ${ttlMinutes} phút.</p>`,
      `<p><a href="${escapeHtml(loginUrl)}" style="display:inline-block;border-radius:999px;background:#020617;color:#fff;padding:12px 20px;text-decoration:none;font-weight:700">Đăng nhập</a></p>`,
      '<p style="font-size:13px;color:#64748b">Nếu nút không hoạt động, mở link này:</p>',
      `<p style="font-size:13px;word-break:break-all"><a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></p>`,
      `<p style="font-size:13px;color:#64748b">Nếu bạn không yêu cầu đăng nhập ${escapeHtml(host)}, bỏ qua email này.</p>`,
      "</div>",
    ].join("");

    const response = await fetch(RESEND_EMAILS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendConfig.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": RESEND_USER_AGENT,
      },
      body: JSON.stringify({
        from: resendConfig.from,
        to: [email],
        subject,
        text,
        html,
      }),
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      console.error("Magic link Resend email send failed", {
        status: response.status,
        body: responseBody,
      });

      return {
        ok: false,
        code: "EMAIL_SEND_FAILED",
        message: "Không gửi được magic link. Kiểm tra Resend config.",
      };
    }

    return { ok: true };
  } catch (error) {
    console.error("Magic link Resend email send failed", error);

    return {
      ok: false,
      code: "EMAIL_SEND_FAILED",
      message: "Không gửi được magic link. Kiểm tra Resend config.",
    };
  }
}

function getPublicBaseUrl(requestUrl: string) {
  const configuredBaseUrl = process.env.APP_BASE_URL?.trim();

  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  return new URL(requestUrl).origin;
}

function getResendConfig(): ResendConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAGIC_LINK_FROM?.trim();

  if (!apiKey || !from) {
    return null;
  }

  return {
    apiKey,
    from,
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}
