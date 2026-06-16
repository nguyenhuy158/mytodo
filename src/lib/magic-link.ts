import "server-only";

import nodemailer from "nodemailer";
import { isEmailAllowed } from "@/lib/auth-config";
import {
  createMagicLoginToken,
  getMagicLinkTtlMinutes,
} from "@/lib/magic-token";

export type MagicLinkSendResult =
  | { ok: true; skipped?: false }
  | { ok: true; skipped: true }
  | {
      ok: false;
      code: "EMAIL_NOT_CONFIGURED" | "EMAIL_SEND_FAILED";
      message: string;
    };

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

  const transportConfig = getSmtpConfig();

  if (!transportConfig) {
    return {
      ok: false,
      code: "EMAIL_NOT_CONFIGURED",
      message: "Chưa cấu hình SMTP để gửi magic link.",
    };
  }

  try {
    const transporter = nodemailer.createTransport(transportConfig);
    const host = new URL(loginUrl).host;
    const ttlMinutes = getMagicLinkTtlMinutes();

    await transporter.sendMail({
      from: getMagicLinkFrom(),
      to: email,
      subject: "Đăng nhập 2026 Tasks",
      text: [
        "Đăng nhập 2026 Tasks",
        "",
        `Mở link này để đăng nhập: ${loginUrl}`,
        "",
        `Link hết hạn sau ${ttlMinutes} phút.`,
        `Nếu bạn không yêu cầu đăng nhập ${host}, bỏ qua email này.`,
      ].join("\n"),
      html: [
        '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">',
        "<h2>Đăng nhập 2026 Tasks</h2>",
        `<p>Bấm nút bên dưới để đăng nhập. Link hết hạn sau ${ttlMinutes} phút.</p>`,
        `<p><a href="${escapeHtml(loginUrl)}" style="display:inline-block;border-radius:999px;background:#020617;color:#fff;padding:12px 20px;text-decoration:none;font-weight:700">Đăng nhập</a></p>`,
        '<p style="font-size:13px;color:#64748b">Nếu nút không hoạt động, mở link này:</p>',
        `<p style="font-size:13px;word-break:break-all"><a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></p>`,
        `<p style="font-size:13px;color:#64748b">Nếu bạn không yêu cầu đăng nhập ${escapeHtml(host)}, bỏ qua email này.</p>`,
        "</div>",
      ].join(""),
    });

    return { ok: true };
  } catch (error) {
    console.error("Magic link email send failed", error);

    return {
      ok: false,
      code: "EMAIL_SEND_FAILED",
      message: "Không gửi được magic link. Kiểm tra SMTP Gmail config.",
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

function getSmtpConfig() {
  const host = process.env.MAGIC_LINK_SMTP_HOST?.trim();
  const user = process.env.MAGIC_LINK_SMTP_USER?.trim();
  const pass = process.env.MAGIC_LINK_SMTP_PASS?.trim();
  const port = Number(process.env.MAGIC_LINK_SMTP_PORT ?? 465);

  if (!host || !user || !pass) {
    return null;
  }

  return {
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  };
}

function getMagicLinkFrom() {
  return (
    process.env.MAGIC_LINK_FROM?.trim() ||
    process.env.MAGIC_LINK_SMTP_USER?.trim() ||
    "2026 Tasks <no-reply@example.com>"
  );
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
