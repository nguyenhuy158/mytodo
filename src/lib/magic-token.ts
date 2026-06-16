import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isEmailAllowed } from "@/lib/auth-config";

const TOKEN_SEPARATOR = ".";
const DEFAULT_TTL_MINUTES = 15;
const usedNonces = new Set<string>();

type MagicLoginPayload = {
  email: string;
  expiresAt: number;
  nonce: string;
  redirectTo: string;
};

type VerifyOptions = {
  consume?: boolean;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function getSafeRedirectPath(redirectTo: string | null | undefined) {
  if (!redirectTo || !redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    return "/";
  }

  if (redirectTo.startsWith("/api/") || redirectTo.startsWith("/login")) {
    return "/";
  }

  return redirectTo;
}

export function createMagicLoginToken({
  email,
  redirectTo,
}: {
  email: string;
  redirectTo: string;
}) {
  const payload: MagicLoginPayload = {
    email,
    expiresAt: Date.now() + getMagicLinkTtlMinutes() * 60 * 1000,
    nonce: randomBytes(16).toString("hex"),
    redirectTo,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");

  return `${encodedPayload}${TOKEN_SEPARATOR}${signPayload(encodedPayload)}`;
}

export function verifyMagicLoginToken(token: string, options: VerifyOptions = {}) {
  const [encodedPayload, signature] = token.split(TOKEN_SEPARATOR);

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);

  if (!isSameSignature(signature, expectedSignature)) {
    return null;
  }

  const payload = parsePayload(encodedPayload);

  if (!payload || payload.expiresAt < Date.now()) {
    return null;
  }

  if (!isEmailAllowed(payload.email)) {
    return null;
  }

  if (options.consume) {
    if (usedNonces.has(payload.nonce)) {
      return null;
    }

    usedNonces.add(payload.nonce);
  }

  return payload;
}

export function getMagicLinkTtlMinutes() {
  const ttl = Number(process.env.MAGIC_LINK_TTL_MINUTES ?? DEFAULT_TTL_MINUTES);

  return Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_TTL_MINUTES;
}

function parsePayload(encodedPayload: string) {
  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<MagicLoginPayload>;

    if (
      typeof payload.email !== "string" ||
      typeof payload.expiresAt !== "number" ||
      typeof payload.nonce !== "string" ||
      typeof payload.redirectTo !== "string"
    ) {
      return null;
    }

    return {
      email: normalizeEmail(payload.email),
      expiresAt: payload.expiresAt,
      nonce: payload.nonce,
      redirectTo: getSafeRedirectPath(payload.redirectTo),
    } satisfies MagicLoginPayload;
  } catch {
    return null;
  }
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getAuthSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function isSameSignature(signature: string, expectedSignature: string) {
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(signatureBuffer, expectedBuffer);
}

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET?.trim();

  if (!secret) {
    throw new Error("Missing AUTH_SECRET for magic link signing.");
  }

  return secret;
}
