"use client";

import { useState } from "react";

type MagicLinkFormProps = {
  redirectTo: string;
};

type SubmitState =
  | { kind: "idle"; message: null }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function MagicLinkForm({ redirectTo }: MagicLinkFormProps) {
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({
    kind: "idle",
    message: null,
  });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSending(true);
    setSubmitState({ kind: "idle", message: null });

    try {
      const response = await fetch("/api/auth/magic/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          redirectTo,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error?.message ?? "Không gửi được link đăng nhập.",
        );
      }

      setSubmitState({
        kind: "success",
        message: payload.message ?? "Kiểm tra Gmail để đăng nhập.",
      });
    } catch (error) {
      setSubmitState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Không gửi được link đăng nhập.",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form className="mt-6 grid gap-3" onSubmit={handleSubmit}>
      <input
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        placeholder="Nhập Gmail được cấp quyền"
        className="h-14 rounded-full border border-white bg-white/85 px-5 text-center text-sm font-bold text-slate-900 shadow-inner shadow-slate-900/5 outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:ring-4 focus:ring-teal-100"
      />
      <button
        type="submit"
        disabled={isSending}
        className="inline-flex h-14 w-full items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-black text-white shadow-xl shadow-slate-900/20 transition hover:-translate-y-0.5 hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 disabled:cursor-wait disabled:opacity-70"
      >
        {isSending ? "Đang gửi..." : "Gửi link đăng nhập"}
      </button>
      {submitState.message ? (
        <p
          className={
            submitState.kind === "error"
              ? "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900"
              : "rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-900"
          }
        >
          {submitState.message}
        </p>
      ) : null}
    </form>
  );
}
