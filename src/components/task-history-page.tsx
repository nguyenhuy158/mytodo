"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  formatTaskRowId,
  type TaskHistoryAction,
  type TaskHistoryEntry,
  type TaskHistoryMetadataValue,
  type TaskHistoryPayload,
} from "@/lib/tasks";
import { AppIcon } from "@/components/app-icon";
import { cn } from "@/lib/utils";

const TASK_HISTORY_API_URL = "/api/task-history?limit=200";

type HistoryFetchError = Error & {
  payload?: {
    error?: {
      message?: string;
    };
  };
};

const fetcher = async (url: string): Promise<TaskHistoryPayload> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json();

  if (!response.ok) {
    const message = payload.error?.message ?? "Không đọc được history.";

    throw Object.assign(new Error(message), { payload });
  }

  return payload;
};

export function TaskHistoryPage() {
  const [query, setQuery] = useState("");
  const { data, error, isLoading } = useSWR<TaskHistoryPayload>(
    TASK_HISTORY_API_URL,
    fetcher,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      keepPreviousData: true,
      shouldRetryOnError: false,
    },
  );
  const entries = useMemo(() => data?.entries ?? [], [data?.entries]);
  const filteredEntries = useMemo(
    () => filterEntries(entries, query),
    [entries, query],
  );
  const stats = useMemo(() => buildHistoryStats(entries), [entries]);
  const historyError = error as HistoryFetchError | undefined;

  return (
    <main className="min-h-[calc(100vh-8rem)] overflow-hidden bg-[radial-gradient(circle_at_18%_8%,#d7f4ec_0,#f8efe2_26rem,transparent_48rem),linear-gradient(135deg,#f8efe2_0%,#e8f0e6_48%,#dde8ef_100%)] text-slate-950">
      <section className="relative mx-auto flex w-full max-w-[95rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <div className="pointer-events-none absolute inset-x-8 top-24 h-56 rounded-full bg-teal-500/10 blur-3xl" />

        <section className="relative z-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <HistoryMetricCard
            label="Tổng history"
            value={String(stats.total)}
            detail="Log mới nhất trên server"
            tone="teal"
          />
          <HistoryMetricCard
            label="Tạo task"
            value={String(stats.created)}
            detail="Task được append vào Sheet"
            tone="emerald"
          />
          <HistoryMetricCard
            label="Update task"
            value={String(stats.updated)}
            detail="Field đã được sửa"
            tone="amber"
          />
          <HistoryMetricCard
            label="Rollback"
            value={String(stats.restored)}
            detail="Restore từ backup"
            tone="rose"
          />
        </section>

        <section className="relative z-10 rounded-[2rem] border border-white/70 bg-white/75 p-4 shadow-2xl shadow-slate-900/10 backdrop-blur md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-teal-700">
                Audit History
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                Ai đã làm gì trên task
              </h1>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                Đang hiển thị {filteredEntries.length}/{entries.length} log
              </p>
            </div>
            <label className="relative">
              <AppIcon
                name="search"
                className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm email, task, field..."
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white/85 pl-11 pr-4 text-sm font-medium outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 sm:w-96"
              />
            </label>
          </div>

          {historyError ? (
            <div className="mt-5 rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">
              {historyError.message}
            </div>
          ) : null}

          {isLoading && !data && !historyError ? (
            <div className="mt-6 rounded-[1.5rem] border border-dashed border-slate-300 bg-white/60 p-8 text-center">
              <AppIcon
                name="loader"
                className="mx-auto size-6 animate-spin text-teal-700"
              />
              <p className="mt-3 text-sm font-bold text-slate-500">
                Đang đọc history...
              </p>
            </div>
          ) : null}

          {!isLoading && !historyError && !filteredEntries.length ? (
            <div className="mt-6 rounded-[1.5rem] border border-dashed border-slate-300 bg-white/60 p-8 text-center">
              <p className="text-lg font-black text-slate-800">
                Chưa có history phù hợp
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                Tạo, sửa task hoặc restore backup để log bắt đầu xuất hiện.
              </p>
            </div>
          ) : null}

          <div className="mt-6 grid gap-3">
            {filteredEntries.map((entry) => (
              <HistoryEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function HistoryEntryCard({ entry }: { entry: TaskHistoryEntry }) {
  const actionMeta = getActionMeta(entry.action);

  return (
    <article className="overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/80 p-4 shadow-sm shadow-slate-900/5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-black",
                actionMeta.className,
              )}
            >
              {actionMeta.label}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
              {formatTarget(entry)}
            </span>
          </div>
          <h2 className="mt-3 break-words text-base font-black leading-6 text-slate-950">
            {entry.summary}
          </h2>
          <p className="mt-1 break-words text-sm font-semibold text-slate-500">
            {entry.actorEmail}
          </p>
        </div>
        <time className="shrink-0 rounded-full bg-slate-50 px-3 py-1 text-xs font-black text-slate-500">
          {formatHistoryDate(entry.createdAt)}
        </time>
      </div>

      {entry.changes.length ? (
        <div className="mt-4 grid gap-2">
          {entry.changes.map((change) => (
            <div
              key={`${entry.id}-${change.field}`}
              className="grid gap-2 rounded-2xl bg-slate-50 p-3 text-sm md:grid-cols-[10rem_1fr_1fr] md:items-start"
            >
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                {change.label}
              </p>
              <HistoryValue label="Trước" value={change.before} />
              <HistoryValue label="Sau" value={change.after} isAfter />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-500">
          Không có field diff, action này ghi nhận thao tác hệ thống.
        </p>
      )}

      {entry.metadata ? (
        <details className="mt-4 rounded-2xl bg-slate-950/95 p-3 text-sm text-slate-100">
          <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.16em] text-teal-200">
            Tracking chi tiết
          </summary>
          <div className="mt-3 grid gap-3">
            {Object.entries(entry.metadata).map(([key, value]) => (
              <div key={`${entry.id}-${key}`} className="min-w-0">
                <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-slate-400">
                  {formatMetadataKey(key)}
                </p>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white/5 p-3 font-mono text-xs leading-5 text-slate-100">
                  {formatMetadataValue(value)}
                </pre>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}

function HistoryValue({
  isAfter = false,
  label,
  value,
}: {
  isAfter?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p
        className={cn(
          "text-[0.65rem] font-black uppercase tracking-[0.16em]",
          isAfter ? "text-teal-700" : "text-slate-400",
        )}
      >
        {label}
      </p>
      <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-700">
        {value || "Trống"}
      </p>
    </div>
  );
}

function HistoryMetricCard({
  detail,
  label,
  tone,
  value,
}: {
  detail: string;
  label: string;
  tone: "teal" | "emerald" | "amber" | "rose";
  value: string;
}) {
  const toneClasses = {
    teal: "from-teal-500/15 to-cyan-500/10 text-teal-800",
    emerald: "from-emerald-400/15 to-lime-400/10 text-emerald-800",
    amber: "from-amber-400/20 to-orange-400/10 text-amber-800",
    rose: "from-rose-400/15 to-orange-400/10 text-rose-800",
  } satisfies Record<typeof tone, string>;

  return (
    <article className="rounded-[1.5rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-900/10 backdrop-blur">
      <div
        className={cn(
          "inline-flex rounded-2xl bg-gradient-to-br px-3 py-2 text-xs font-black uppercase tracking-[0.2em]",
          toneClasses[tone],
        )}
      >
        {label}
      </div>
      <p className="mt-5 text-4xl font-black tracking-[-0.08em] text-slate-950">
        {value}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-500">{detail}</p>
    </article>
  );
}

function filterEntries(entries: TaskHistoryEntry[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return entries;
  }

  return entries.filter((entry) =>
    [
      entry.actorEmail,
      entry.action,
      entry.summary,
      entry.target.taskTitle,
      entry.target.backupId,
      stringifyMetadata(entry.metadata),
      ...entry.changes.flatMap((change) => [
        change.label,
        change.before,
        change.after,
      ]),
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
  );
}

function buildHistoryStats(entries: TaskHistoryEntry[]) {
  return {
    total: entries.length,
    created: entries.filter((entry) => entry.action === "task.create").length,
    updated: entries.filter((entry) => entry.action === "task.update").length,
    restored: entries.filter((entry) => entry.action === "backup.restore").length,
  };
}

function getActionMeta(action: TaskHistoryAction) {
  const actionMap = {
    "task.create": {
      label: "Tạo task",
      className: "bg-emerald-100 text-emerald-800",
    },
    "task.update": {
      label: "Update task",
      className: "bg-amber-100 text-amber-800",
    },
    "backup.create": {
      label: "Backup",
      className: "bg-indigo-100 text-indigo-800",
    },
    "backup.restore": {
      label: "Restore",
      className: "bg-rose-100 text-rose-800",
    },
    "config.create": {
      label: "Tạo config",
      className: "bg-teal-100 text-teal-800",
    },
    "config.update": {
      label: "Sửa config",
      className: "bg-cyan-100 text-cyan-800",
    },
    "config.delete": {
      label: "Xóa config",
      className: "bg-slate-100 text-slate-700",
    },
  } satisfies Record<TaskHistoryAction, { label: string; className: string }>;

  return actionMap[action];
}

function formatTarget(entry: TaskHistoryEntry) {
  if (entry.target.type === "task") {
    return entry.target.rowNumber
      ? formatTaskRowId(entry.target.rowNumber)
      : "Task";
  }

  if (entry.target.backupId) {
    return `Backup ${entry.target.backupId.slice(0, 8)}`;
  }

  if (entry.target.type === "config") {
    if (entry.target.configCategory) {
      return `${entry.target.configCategory}: ${entry.target.configValue ?? "config"}`;
    }

    return entry.target.taskTitle ? `Config ${entry.target.taskTitle}` : "Config";
  }

  return "Sheet";
}

function formatMetadataKey(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase());
}

function formatMetadataValue(value: TaskHistoryMetadataValue): string {
  if (typeof value === "string") {
    return value || "Trống";
  }

  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return JSON.stringify(value, null, 2);
}

function stringifyMetadata(
  metadata: TaskHistoryEntry["metadata"],
): string | undefined {
  return metadata ? JSON.stringify(metadata) : undefined;
}

function formatHistoryDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
