import { signIn } from "@/auth";
import { isMagicLinkEnabled } from "@/lib/magic-link";
import { verifyMagicLoginToken } from "@/lib/magic-token";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isMagicLinkEnabled()) {
    return Response.redirect(new URL("/login?error=MagicLink", request.url));
  }

  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token");

  if (!token) {
    return Response.redirect(new URL("/login?error=MagicLink", request.url));
  }

  const payload = verifyMagicLoginToken(token);

  if (!payload) {
    return Response.redirect(new URL("/login?error=MagicLink", request.url));
  }

  await signIn("magic-link", {
    token,
    redirectTo: payload.redirectTo,
  });
}
