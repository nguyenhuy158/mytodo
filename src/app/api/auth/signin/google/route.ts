import { POST, signIn } from "@/auth";

export { POST };

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const callbackUrl = getSafeCallbackUrl(requestUrl.searchParams.get("callbackUrl"));

  await signIn("google", {
    redirectTo: callbackUrl,
  });
}

function getSafeCallbackUrl(callbackUrl: string | null) {
  if (!callbackUrl || !callbackUrl.startsWith("/") || callbackUrl.startsWith("//")) {
    return "/";
  }

  if (callbackUrl.startsWith("/api/") || callbackUrl.startsWith("/login")) {
    return "/";
  }

  return callbackUrl;
}
