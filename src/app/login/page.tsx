import type { Metadata } from "next";
import Link from "next/link";
import { auth, signIn } from "@/auth";
import { MagicLinkForm } from "@/components/magic-link-form";
import { isEmailAllowed } from "@/lib/auth-config";

type LoginPageProps = {
  searchParams?: Promise<{
    callbackUrl?: string;
    error?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Login | 2026 Tasks",
  description: "Google login for private task dashboard.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const callbackUrl = getSafeCallbackUrl(params?.callbackUrl);
  const session = await auth();
  const email = session?.user?.email ?? null;
  const isAllowed = isEmailAllowed(email);
  const errorMessage = getErrorMessage(params?.error);

  return (
    <main className="overflow-hidden bg-[#f7f1e8] text-slate-950">
      <section className="relative mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-xl items-center px-4 py-10 sm:px-8">
        <div className="absolute inset-0 -z-0 bg-[radial-gradient(circle_at_20%_10%,rgba(20,184,166,0.16),transparent_30%),linear-gradient(135deg,#f7f1e8_0%,#f5fbdf_100%)]" />
        <div className="relative w-full rounded-[2rem] border border-white/80 bg-white/75 p-6 text-center shadow-2xl shadow-slate-900/10 backdrop-blur-xl sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">
            Private tasks
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.07em] text-slate-950 sm:text-5xl">
            Đăng nhập
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm font-semibold leading-6 text-slate-500">
            Nhập Gmail hoặc dùng Google để truy cập task nội bộ.
          </p>

          {errorMessage ? (
            <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
              {errorMessage}
            </p>
          ) : null}

          {isAllowed ? (
            <div className="mt-6 grid gap-3">
              <p className="break-all rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-600">
                {email}
              </p>
              <Link
                href={callbackUrl}
                className="inline-flex h-14 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-black text-white shadow-xl shadow-slate-900/20 transition hover:-translate-y-0.5 hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200"
              >
                Vào dashboard
              </Link>
            </div>
          ) : (
            <div>
              <MagicLinkForm redirectTo={callbackUrl} />
              <div className="my-5 flex items-center gap-3 text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                hoặc
                <span className="h-px flex-1 bg-slate-200" />
              </div>
              <form
                action={async () => {
                  "use server";
                  await signIn("google", { redirectTo: callbackUrl });
                }}
              >
                <button
                  type="submit"
                  className="inline-flex h-14 w-full items-center justify-center rounded-full border border-white bg-white/80 px-5 text-sm font-black text-slate-900 shadow-lg shadow-slate-900/10 transition hover:-translate-y-0.5 hover:border-teal-200 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200"
                >
                  Tiếp tục với Google
                </button>
              </form>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function getSafeCallbackUrl(callbackUrl: string | undefined) {
  if (!callbackUrl || !callbackUrl.startsWith("/") || callbackUrl.startsWith("//")) {
    return "/";
  }

  if (callbackUrl.startsWith("/api/") || callbackUrl.startsWith("/login")) {
    return "/";
  }

  return callbackUrl;
}

function getErrorMessage(error: string | undefined) {
  if (error === "AccessDenied") {
    return "Email này chưa được cấp quyền truy cập.";
  }

  if (error === "Configuration") {
    return "Đăng nhập đang chưa được cấu hình đúng.";
  }

  if (error === "MagicLink" || error === "CredentialsSignin") {
    return "Link đăng nhập không hợp lệ hoặc đã hết hạn.";
  }

  if (error) {
    return "Không đăng nhập được. Kiểm tra lại Google OAuth config.";
  }

  return null;
}
