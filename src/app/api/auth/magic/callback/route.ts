import { signIn } from "@/auth";
import { verifyMagicLoginToken } from "@/lib/magic-token";

export const runtime = "nodejs";

export async function GET(request: Request) {
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
