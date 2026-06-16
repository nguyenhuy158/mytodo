import { auth } from "@/auth";
import { isEmailAllowed } from "@/lib/auth-config";
import { NextResponse } from "next/server";

const PUBLIC_PATH_PREFIXES = ["/login", "/api/auth", "/api/health"];

export default auth((request) => {
  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const email = request.auth?.user?.email;

  if (!email) {
    return isApiPath(pathname)
      ? authJsonResponse("AUTH_REQUIRED", "Bạn cần đăng nhập bằng Google.", 401)
      : redirectToLogin(request.url, pathname, search);
  }

  if (!isEmailAllowed(email)) {
    return isApiPath(pathname)
      ? authJsonResponse("AUTH_FORBIDDEN", "Email này không được phép xem dữ liệu.", 403)
      : redirectToLogin(request.url, pathname, search, "AccessDenied");
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};

function isPublicPath(pathname: string) {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isApiPath(pathname: string) {
  return pathname.startsWith("/api/");
}

function redirectToLogin(
  requestUrl: string,
  pathname: string,
  search: string,
  error?: string,
) {
  const url = new URL("/login", requestUrl);

  if (pathname !== "/") {
    url.searchParams.set("callbackUrl", `${pathname}${search}`);
  }

  if (error) {
    url.searchParams.set("error", error);
  }

  return NextResponse.redirect(url);
}

function authJsonResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
