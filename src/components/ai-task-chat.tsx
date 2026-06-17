"use client";

import { useState, type FormEvent } from "react";
import type { TaskAiChatPayload } from "@/lib/task-ai-types";
import { AppIcon } from "@/components/app-icon";
import { cn } from "@/lib/utils";

const TASK_CHAT_API_URL = "/api/ai/task-chat";

type ChatMessage =
  | {
      id: string;
      role: "user";
      text: string;
    }
  | {
      id: string;
      payload?: TaskAiChatPayload;
      role: "assistant";
      text: string;
    };

export function AiTaskChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "hello",
      role: "assistant",
      text: "Bạn hỏi về task hiện tại được nha. Ví dụ: task nào đang trễ, tuần này liên quan khách A còn gì, nên làm gì trước.",
    },
  ]);
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedQuestion = question.trim();

    if (!normalizedQuestion || isSending) {
      return;
    }

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: crypto.randomUUID(),
        role: "user",
        text: normalizedQuestion,
      },
    ]);
    setQuestion("");
    setIsSending(true);

    try {
      const payload = await askTaskAi(normalizedQuestion);

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: crypto.randomUUID(),
          payload,
          role: "assistant",
          text: payload.answer,
        },
      ]);
    } catch (error) {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text:
            error instanceof Error
              ? error.message
              : "Không hỏi được AI lúc này.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-50">
      {isOpen ? (
        <section className="mb-3 flex h-[min(36rem,calc(100vh-8rem))] w-[min(calc(100vw-2rem),28rem)] flex-col overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/95 shadow-2xl shadow-slate-900/25 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-slate-950 text-white">
                <AppIcon name="bot" className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-950">
                  AI Search Hỏi Đáp
                </p>
                <p className="truncate text-xs font-semibold text-slate-500">
                  Gemini đọc task hiện tại
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-teal-200 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
              aria-label="Đóng AI chat"
            >
              <AppIcon name="x" className="size-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-[#f9f4ec] p-4">
            <div className="grid gap-3">
              {messages.map((message) => (
                <ChatBubble key={message.id} message={message} />
              ))}
              {isSending ? (
                <div className="max-w-[85%] rounded-2xl bg-white p-3 text-sm font-semibold text-slate-500 shadow-sm">
                  <AppIcon
                    name="loader"
                    className="mr-2 inline size-4 animate-spin text-teal-700"
                  />
                  Đang hỏi Gemini...
                </div>
              ) : null}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="border-t border-slate-100 p-3">
            <div className="flex gap-2">
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Hỏi task nào đang trễ..."
                disabled={isSending}
                className="h-11 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 disabled:cursor-wait disabled:opacity-70"
              />
              <button
                type="submit"
                disabled={isSending || !question.trim()}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-teal-700 px-4 text-white shadow-lg shadow-teal-900/15 transition hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Gửi câu hỏi"
              >
                <AppIcon
                  name={isSending ? "loader" : "send"}
                  className={cn("size-4", isSending && "animate-spin")}
                />
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-black text-white shadow-2xl shadow-slate-900/25 transition hover:-translate-y-0.5 hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200"
        aria-label="Mở AI Search Hỏi Đáp"
      >
        <AppIcon name="messageCircle" className="size-5" />
        <span className="hidden sm:inline">AI hỏi đáp</span>
      </button>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <article
      className={cn(
        "max-w-[88%] rounded-2xl p-3 text-sm leading-6 shadow-sm",
        isUser
          ? "ml-auto bg-slate-950 text-white"
          : "mr-auto bg-white text-slate-700",
      )}
    >
      <p className="whitespace-pre-wrap break-words font-semibold">
        {message.text}
      </p>
      {!isUser && message.payload ? (
        <div className="mt-3 grid gap-2">
          {message.payload.relatedTasks.length ? (
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                Task liên quan
              </p>
              <div className="mt-2 grid gap-2">
                {message.payload.relatedTasks.map((task, index) => (
                  <div key={`${task.taskId ?? task.title}-${index}`}>
                    <p className="font-black text-slate-900">
                      {task.taskId ? `${task.taskId} · ` : ""}
                      {task.title}
                    </p>
                    <p className="text-xs font-semibold text-slate-500">
                      {task.status} · {task.priority} ·{" "}
                      {task.deadline || "No deadline"}
                    </p>
                    {task.reason ? (
                      <p className="text-xs text-slate-500">{task.reason}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {message.payload.suggestedNextActions.length ? (
            <div className="rounded-xl bg-teal-50 p-3 text-teal-950">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-700">
                Gợi ý tiếp theo
              </p>
              <ul className="mt-2 list-inside list-disc text-xs font-semibold leading-5">
                {message.payload.suggestedNextActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

async function askTaskAi(question: string) {
  const response = await fetch(TASK_CHAT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question }),
  });
  const text = await response.text();
  let payload: unknown = {};

  if (text.trim()) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw Object.assign(
        new Error(
          `Không hỏi được AI. Server trả response không phải JSON (${response.status} ${response.statusText}).`,
        ),
        {
          payload: {
            error: {
              message: text.slice(0, 240),
            },
          },
        },
      );
    }
  }

  if (!response.ok) {
    const message =
      isRecord(payload) &&
      isRecord(payload.error) &&
      typeof payload.error.message === "string"
        ? payload.error.message
        : "Không hỏi được AI.";

    throw Object.assign(new Error(message), { payload });
  }

  return payload as TaskAiChatPayload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
