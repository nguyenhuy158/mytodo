"use client";

import {
  startTransition,
  useDeferredValue,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import useSWR from "swr";
import {
  applyTaskUpdate,
  formatTaskRowId,
  type SheetTask,
  type TaskPriority,
  type TaskStatus,
  type TaskUpdateInput,
  type TasksPayload,
} from "@/lib/tasks";
import type {
  WeeklyAiSummaryItem,
  WeeklyAiSummaryPayload,
} from "@/lib/task-ai-types";
import { AppIcon } from "@/components/app-icon";
import { TaskDetailDialog } from "@/components/task-detail-dialog";
import { TaskReportExportActions } from "@/components/task-report-export-actions";
import { TaskTimelinePill } from "@/components/task-timeline";
import { usePersistedTaskSelection } from "@/components/use-persisted-task-selection";
import { cn } from "@/lib/utils";

const TASKS_API_URL = "/api/tasks";
const WEEK_SUMMARY_API_URL = "/api/ai/week-summary";
const WEEK_SELECTION_STORAGE_KEY = "mytodo:selected-task:/week";

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
  Unknown: 3,
};

const STATUS_ORDER: Record<TaskStatus, number> = {
  "In Progress": 0,
  "Not Started": 1,
  Blocked: 2,
  Unknown: 3,
  Done: 4,
};

type WeekWindow = {
  todayISO: string;
  weekStartISO: string;
  weekEndISO: string;
};

type TaskFetchError = Error & {
  payload?: {
    error?: {
      code?: string;
      message?: string;
    };
  };
};

type WeekSummaryFetchError = Error & {
  payload?: {
    error?: {
      code?: string;
      message?: string;
    };
  };
};

type WeekDay = {
  iso: string;
  label: string;
  tasks: SheetTask[];
};

const fetcher = async (url: string): Promise<TasksPayload> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json();

  if (!response.ok) {
    const message = payload.error?.message ?? "Không đọc được dữ liệu task.";

    throw Object.assign(new Error(message), { payload });
  }

  return payload;
};

const requestWeekSummary = async (): Promise<WeeklyAiSummaryPayload> => {
  const response = await fetch(WEEK_SUMMARY_API_URL, {
    cache: "no-store",
    method: "POST",
  });
  const payload = await response.json();

  if (!response.ok) {
    const message =
      payload.error?.message ?? "Không tạo được tóm tắt AI hôm nay.";

    throw Object.assign(new Error(message), { payload });
  }

  return payload;
};

export function WeeklyTasksPage() {
  const [query, setQuery] = useState("");
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [savingRowNumber, setSavingRowNumber] = useState<number | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryPayload, setSummaryPayload] =
    useState<WeeklyAiSummaryPayload | null>(null);
  const deferredQuery = useDeferredValue(query);
  const { data, error, isLoading, mutate } = useSWR<TasksPayload>(
    TASKS_API_URL,
    fetcher,
    {
      refreshInterval: (latestData) => latestData?.meta.pollingMs ?? 15_000,
      revalidateOnFocus: true,
      keepPreviousData: true,
    },
  );

  const weekWindow = useMemo(() => getCurrentWeekWindow(), []);
  const tasks = useMemo(() => data?.tasks ?? [], [data?.tasks]);
  const [selectedTaskId, setSelectedTaskId] = usePersistedTaskSelection({
    isReady: Boolean(data),
    storageKey: WEEK_SELECTION_STORAGE_KEY,
    tasks,
  });
  const taskError = error as TaskFetchError | undefined;
  const weekTasks = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    return tasks
      .filter((task) => isTaskInWeek(task, weekWindow))
      .filter((task) =>
        normalizedQuery ? matchesQuery(task, normalizedQuery) : true,
      )
      .sort(compareWeekTasks);
  }, [deferredQuery, tasks, weekWindow]);
  const weekDays = useMemo(
    () => buildWeekDays(weekWindow, weekTasks),
    [weekTasks, weekWindow],
  );
  const activeTasks = weekTasks.filter((task) => task.status !== "Done");
  const overdueTasks = activeTasks.filter((task) => task.isOverdue);
  const todayTasks = activeTasks.filter(
    (task) => task.deadlineISO === weekWindow.todayISO,
  );
  const highPriorityTasks = activeTasks.filter((task) => task.priority === "High");
  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );

  const handleSearchChange = (nextQuery: string) => {
    startTransition(() => {
      setQuery(nextQuery);
    });
  };

  const handleTaskUpdate = async (input: TaskUpdateInput) => {
    setSavingRowNumber(input.rowNumber);

    const previousData = data;
    const optimisticData = applyTaskUpdate(previousData, input);

    if (optimisticData) {
      await mutate(optimisticData, { revalidate: false });
    }

    const updatePromise = fetch(TASKS_API_URL, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }).then(async (response) => {
      const payload = await response.json();

      if (!response.ok) {
        const message =
          payload.error?.message ?? "Không cập nhật được Google Sheet.";

        throw Object.assign(new Error(message), { payload });
      }

      return payload as TasksPayload;
    });

    toast.promise(updatePromise, {
      loading: `Đang cập nhật ${formatTaskRowId(input.rowNumber)}...`,
      success: "Đã ghi dữ liệu về Google Sheet.",
      error: (updateError) =>
        updateError instanceof Error
          ? updateError.message
          : "Không cập nhật được Google Sheet.",
    });

    try {
      const payload = await updatePromise;

      await mutate(payload, { revalidate: false });
    } catch (updateError) {
      if (previousData) {
        await mutate(previousData, { revalidate: false });
      }

      throw updateError;
    } finally {
      setSavingRowNumber(null);
    }
  };

  const handleWeekSummaryClick = async () => {
    setIsSummaryLoading(true);
    setSummaryError(null);
    setSummaryPayload(null);

    try {
      setSummaryPayload(await requestWeekSummary());
    } catch (summaryFetchError) {
      const typedError = summaryFetchError as WeekSummaryFetchError;

      setSummaryError(
        typedError.payload?.error?.message ||
          typedError.message ||
          "Không tạo được tóm tắt AI hôm nay.",
      );
    } finally {
      setIsSummaryLoading(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-8rem)] overflow-hidden bg-[radial-gradient(circle_at_15%_10%,#d7f4ec_0,#f5efe4_28rem,transparent_48rem),linear-gradient(135deg,#f8efe2_0%,#e7f2ed_48%,#dce8f0_100%)] text-slate-950">
      <section className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <div className="pointer-events-none absolute inset-x-8 top-24 h-56 rounded-full bg-amber-400/10 blur-3xl" />

        {taskError ? (
          <ErrorNotice
            code={taskError.payload?.error?.code}
            message={taskError.message}
          />
        ) : null}

        <section className="relative z-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <WeeklyMetricCard
            label="Deadline tuần này"
            value={String(weekTasks.length)}
            detail={`${activeTasks.length} task chưa Done`}
            tone="teal"
          />
          <WeeklyMetricCard
            label="Hôm nay"
            value={String(todayTasks.length)}
            detail={formatLongDate(weekWindow.todayISO)}
            tone="amber"
          />
          <WeeklyMetricCard
            label="Trễ hạn"
            value={String(overdueTasks.length)}
            detail="Chưa Done và quá deadline"
            tone="rose"
          />
          <WeeklyMetricCard
            label="High priority"
            value={String(highPriorityTasks.length)}
            detail="Cần ưu tiên trong tuần"
            tone="slate"
          />
        </section>

        <section className="relative z-10 rounded-[2rem] border border-white/70 bg-white/75 p-4 shadow-2xl shadow-slate-900/10 backdrop-blur md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-teal-700">
                Weekly Board
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                Deadline từ thứ 2 tới chủ nhật
              </h2>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <TaskReportExportActions
                periodEndISO={weekWindow.weekEndISO}
                periodLabel={`${formatLongDate(weekWindow.weekStartISO)} - ${formatLongDate(weekWindow.weekEndISO)}`}
                periodStartISO={weekWindow.weekStartISO}
                scope="week"
                tasks={weekTasks}
              />
              <button
                type="button"
                onClick={handleWeekSummaryClick}
                disabled={isSummaryLoading}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:min-w-44"
              >
                <AppIcon
                  name={isSummaryLoading ? "loader" : "sparkles"}
                  className={cn("size-4", isSummaryLoading ? "animate-spin" : "")}
                />
                Tóm tắt hôm nay
              </button>
              <label className="relative">
                <AppIcon
                  name="search"
                  className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={query}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  placeholder="Tìm task trong tuần..."
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white/85 pl-11 pr-4 text-sm font-medium outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 sm:w-80"
                />
              </label>
            </div>
          </div>

          {summaryError ? (
            <AiSummaryErrorNotice message={summaryError} />
          ) : null}

          {summaryPayload ? (
            <WeeklyAiSummaryPanel
              payload={summaryPayload}
              onTaskSelect={setSelectedTaskId}
            />
          ) : null}

          {isLoading && !data ? (
            <div className="mt-6 rounded-[1.5rem] border border-dashed border-slate-300 bg-white/60 p-8 text-center">
              <AppIcon
                name="loader"
                className="mx-auto size-6 animate-spin text-teal-700"
              />
              <p className="mt-3 text-sm font-bold text-slate-500">
                Đang đọc task từ cache/API...
              </p>
            </div>
          ) : (
            <WeeklyDayGrid days={weekDays} onTaskSelect={setSelectedTaskId} />
          )}
        </section>
      </section>

      {selectedTask ? (
        <TaskDetailDialog
          isSaving={savingRowNumber === selectedTask.rowNumber}
          task={selectedTask}
          onClose={() => setSelectedTaskId(null)}
          onTaskUpdate={handleTaskUpdate}
        />
      ) : null}
    </main>
  );
}

function WeeklyMetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "teal" | "amber" | "rose" | "slate";
}) {
  const toneClasses = {
    teal: "from-teal-500/15 to-cyan-500/10 text-teal-800",
    amber: "from-amber-400/20 to-orange-400/10 text-amber-800",
    rose: "from-rose-400/15 to-orange-400/10 text-rose-800",
    slate: "from-slate-900/10 to-slate-400/10 text-slate-800",
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

function WeeklyAiSummaryPanel({
  onTaskSelect,
  payload,
}: {
  onTaskSelect: (taskId: string) => void;
  payload: WeeklyAiSummaryPayload;
}) {
  const sections = [
    {
      items: payload.summary.today,
      label: "Việc cần làm hôm nay",
      tone: "teal",
    },
    {
      items: payload.summary.overdue,
      label: "Việc trễ hạn",
      tone: "rose",
    },
    {
      items: payload.summary.risks,
      label: "Rủi ro",
      tone: "amber",
    },
    {
      items: payload.summary.priorityOrder,
      label: "Thứ tự ưu tiên",
      tone: "slate",
    },
  ] satisfies Array<{
    items: WeeklyAiSummaryItem[];
    label: string;
    tone: SummarySectionTone;
  }>;

  return (
    <section className="mt-5 rounded-[1.5rem] border border-teal-100 bg-teal-50/70 p-4 shadow-inner shadow-white/80">
      <div className="flex flex-col gap-3 border-b border-teal-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-teal-800">
            <AppIcon name="sparkles" className="size-3.5" />
            Gemini
          </div>
          <h3 className="mt-3 text-xl font-black text-slate-950">
            Tóm tắt hôm nay
          </h3>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
            {payload.summary.overview}
          </p>
        </div>
        <div className="rounded-2xl bg-white/80 px-3 py-2 text-xs font-bold text-slate-500">
          {formatGeneratedAt(payload.meta.generatedAt)} ·{" "}
          {payload.meta.includedTaskCount} task · {payload.meta.model}
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-4">
        {sections.map((section) => (
          <AiSummarySection
            key={section.label}
            items={section.items}
            label={section.label}
            onTaskSelect={onTaskSelect}
            tone={section.tone}
          />
        ))}
      </div>
    </section>
  );
}

type SummarySectionTone = "amber" | "rose" | "slate" | "teal";

function AiSummarySection({
  items,
  label,
  onTaskSelect,
  tone,
}: {
  items: WeeklyAiSummaryItem[];
  label: string;
  onTaskSelect: (taskId: string) => void;
  tone: SummarySectionTone;
}) {
  const toneClasses = {
    amber: "bg-amber-100 text-amber-800",
    rose: "bg-rose-100 text-rose-800",
    slate: "bg-slate-200 text-slate-800",
    teal: "bg-teal-100 text-teal-800",
  } satisfies Record<SummarySectionTone, string>;

  return (
    <article className="rounded-[1.25rem] border border-white/80 bg-white/80 p-3">
      <h4
        className={cn(
          "inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.14em]",
          toneClasses[tone],
        )}
      >
        {label}
      </h4>

      {items.length ? (
        <div className="mt-3 grid gap-2">
          {items.map((item, index) => (
            <AiSummaryItemCard
              key={`${label}-${item.taskId ?? "item"}-${index}`}
              item={item}
              onTaskSelect={onTaskSelect}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-400">
          Không có task phù hợp.
        </p>
      )}
    </article>
  );
}

function AiSummaryItemCard({
  item,
  onTaskSelect,
}: {
  item: WeeklyAiSummaryItem;
  onTaskSelect: (taskId: string) => void;
}) {
  const canOpenTask = Boolean(item.taskId);

  return (
    <button
      type="button"
      disabled={!canOpenTask}
      onClick={() => {
        if (item.taskId) {
          onTaskSelect(item.taskId);
        }
      }}
      className={cn(
        "w-full rounded-2xl border border-slate-100 bg-white p-3 text-left shadow-sm shadow-slate-900/5 transition",
        canOpenTask
          ? "hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200"
          : "cursor-default",
      )}
    >
      <p className="text-sm font-black leading-snug text-slate-950">
        {item.title}
      </p>
      <p className="mt-2 text-xs font-bold leading-5 text-teal-700">
        {item.action}
      </p>
      {item.reason ? (
        <p className="mt-2 text-xs leading-5 text-slate-500">{item.reason}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {item.priority ? <SummaryTag value={item.priority} /> : null}
        {item.status ? <SummaryTag value={item.status} /> : null}
        {item.deadline ? <SummaryTag value={item.deadline} /> : null}
      </div>
    </button>
  );
}

function SummaryTag({ value }: { value: string }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-1 text-[0.65rem] font-black text-slate-600">
      {value}
    </span>
  );
}

function AiSummaryErrorNotice({ message }: { message: string }) {
  return (
    <div className="mt-5 rounded-[1.25rem] border border-amber-200 bg-amber-50/80 p-4 text-amber-950">
      <div className="flex gap-3">
        <AppIcon name="alertCircle" className="mt-0.5 size-4" />
        <p className="text-sm font-bold leading-6">{message}</p>
      </div>
    </div>
  );
}

function WeeklyDayGrid({
  days,
  onTaskSelect,
}: {
  days: WeekDay[];
  onTaskSelect: (taskId: string) => void;
}) {
  const [expandedEmptyDays, setExpandedEmptyDays] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleEmptyDay = (dayISO: string) => {
    setExpandedEmptyDays((currentDays) => {
      const nextDays = new Set(currentDays);

      if (nextDays.has(dayISO)) {
        nextDays.delete(dayISO);
      } else {
        nextDays.add(dayISO);
      }

      return nextDays;
    });
  };

  return (
    <div className="mt-6 grid items-start gap-3 xl:grid-cols-7">
      {days.map((day) => {
        const isEmpty = day.tasks.length === 0;
        const isExpanded = expandedEmptyDays.has(day.iso);

        return (
          <section
            key={day.iso}
            className={cn(
              "rounded-[1.25rem] border bg-slate-50/80 p-3",
              isEmpty ? "border-dashed border-slate-200/80" : "border-slate-200",
            )}
          >
            {isEmpty ? (
              <button
                type="button"
                onClick={() => toggleEmptyDay(day.iso)}
                aria-expanded={isExpanded}
                className="flex w-full items-center justify-between gap-2 rounded-2xl text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
              >
                <h3 className="text-sm font-black text-slate-900">{day.label}</h3>
                <span className="inline-flex items-center gap-1.5">
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-slate-500">
                    {day.tasks.length}
                  </span>
                  <AppIcon
                    name="chevronDown"
                    className={cn(
                      "size-4 text-slate-400 transition-transform",
                      isExpanded && "rotate-180",
                    )}
                  />
                </span>
              </button>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-black text-slate-900">{day.label}</h3>
                <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-slate-500">
                  {day.tasks.length}
                </span>
              </div>
            )}

            {isEmpty ? (
              isExpanded ? (
                <p className="mt-3 rounded-2xl bg-white/70 p-3 text-sm font-semibold text-slate-400">
                  Không có deadline
                </p>
              ) : null
            ) : (
              <div className="mt-3 grid gap-2">
                {day.tasks.map((task) => (
                  <WeeklyTaskCard
                    key={task.id}
                    task={task}
                    onClick={() => onTaskSelect(task.id)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function WeeklyTaskCard({
  task,
  onClick,
}: {
  task: SheetTask;
  onClick: () => void;
}) {
  const isDone = task.status === "Done";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Xem chi tiết task: ${task.task}`}
      className={cn(
        "w-full rounded-2xl border bg-white p-3 text-left shadow-sm shadow-slate-900/5 transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200",
        isDone
          ? "border-slate-200 bg-slate-100/80 text-slate-500 opacity-50 grayscale shadow-none hover:translate-y-0 hover:border-slate-200 hover:shadow-none"
          : "opacity-100",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusPill status={task.status} />
        <PriorityPill priority={task.priority} />
        <TaskTimelinePill
          task={task}
          className={cn(
            "px-2 py-1 text-[0.65rem]",
            isDone && "bg-slate-200 text-slate-500",
          )}
        />
        {task.system ? (
          <span
            className={cn(
              "rounded-full bg-slate-100 px-2 py-1 text-[0.65rem] font-black text-slate-600",
              isDone && "bg-slate-200 text-slate-500",
            )}
          >
            {task.system}
          </span>
        ) : null}
      </div>
      <h4
        className={cn(
          "mt-2 text-sm font-black leading-snug text-slate-950",
          isDone && "text-slate-500 line-through decoration-slate-400/80",
        )}
      >
        {task.task}
      </h4>
      <p className={cn("mt-2 text-xs font-bold text-slate-500", isDone && "text-slate-400")}>
        Rec: {task.dateReceived || "No start"} · Due:{" "}
        {task.deadline || "No deadline"}
      </p>
      {task.daysLeft !== null && task.status !== "Done" ? (
        <p
          className={cn(
            "mt-2 rounded-xl px-2 py-1 text-xs font-black",
            task.daysLeft < 0
              ? "bg-rose-100 text-rose-700"
              : "bg-emerald-100 text-emerald-700",
          )}
        >
          {task.daysLeft < 0
            ? `Trễ ${Math.abs(task.daysLeft)} ngày`
            : `Còn ${task.daysLeft} ngày`}
        </p>
      ) : null}
      {task.note ? (
        <p
          className={cn(
            "mt-2 line-clamp-3 rounded-xl bg-slate-50 p-2 text-xs leading-5 text-slate-600",
            isDone && "bg-slate-200/70 text-slate-400",
          )}
        >
          {task.note}
        </p>
      ) : null}
      <p className={cn("mt-3 text-xs font-black text-teal-700", isDone && "text-slate-400")}>
        Click để xem chi tiết
      </p>
    </button>
  );
}

function StatusPill({ status }: { status: TaskStatus }) {
  const colors = {
    "In Progress": "bg-teal-100 text-teal-800",
    "Not Started": "bg-amber-100 text-amber-800",
    Done: "bg-slate-200 text-slate-500",
    Blocked: "bg-rose-100 text-rose-800",
    Unknown: "bg-slate-100 text-slate-600",
  } satisfies Record<TaskStatus, string>;

  return (
    <span className={cn("rounded-full px-2 py-1 text-[0.65rem] font-black", colors[status])}>
      {status}
    </span>
  );
}

function PriorityPill({ priority }: { priority: TaskPriority }) {
  const colors = {
    High: "bg-rose-50 text-rose-700",
    Medium: "bg-yellow-50 text-yellow-700",
    Low: "bg-sky-50 text-sky-700",
    Unknown: "bg-slate-50 text-slate-500",
  } satisfies Record<TaskPriority, string>;

  return (
    <span
      className={cn("rounded-full px-2 py-1 text-[0.65rem] font-black", colors[priority])}
    >
      {priority}
    </span>
  );
}

function ErrorNotice({ code, message }: { code?: string; message: string }) {
  const isConfigError = code === "SHEET_CONFIG_ERROR";

  return (
    <section className="relative z-10 rounded-[2rem] border border-amber-300/70 bg-amber-50/90 p-5 text-amber-950 shadow-xl shadow-amber-900/10">
      <div className="flex gap-4">
        <AppIcon name="alertCircle" className="mt-1 size-5" />
        <div>
          <h2 className="text-lg font-black">
            {isConfigError
              ? "Cần cấu hình Google Service Account"
              : "Không đọc được dữ liệu task"}
          </h2>
          <p className="mt-2 text-sm leading-6">{message}</p>
        </div>
      </div>
    </section>
  );
}

function buildWeekDays(weekWindow: WeekWindow, tasks: SheetTask[]): WeekDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(parseLocalISODate(weekWindow.weekStartISO), index);
    const iso = getLocalISODate(date);

    return {
      iso,
      label: formatWeekDay(iso),
      tasks: tasks.filter((task) => task.deadlineISO === iso),
    };
  });
}

function matchesQuery(task: SheetTask, normalizedQuery: string) {
  return [
    task.task,
    task.details,
    task.note,
    task.tags,
    task.system,
    task.priority,
    task.status,
    task.timeline,
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

function isTaskInWeek(task: SheetTask, weekWindow: WeekWindow) {
  return Boolean(
    task.deadlineISO &&
      task.deadlineISO >= weekWindow.weekStartISO &&
      task.deadlineISO <= weekWindow.weekEndISO,
  );
}

function compareWeekTasks(left: SheetTask, right: SheetTask) {
  const leftDone = left.status === "Done" ? 1 : 0;
  const rightDone = right.status === "Done" ? 1 : 0;

  if (leftDone !== rightDone) {
    return leftDone - rightDone;
  }

  const statusDiff = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];

  if (statusDiff !== 0) {
    return statusDiff;
  }

  const priorityDiff =
    PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];

  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return getDateReceivedTime(right) - getDateReceivedTime(left);
}

function getDateReceivedTime(task: SheetTask) {
  return task.startDateISO ? Date.parse(`${task.startDateISO}T00:00:00Z`) : 0;
}

function getCurrentWeekWindow(): WeekWindow {
  const today = new Date();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = addDays(today, mondayOffset);
  const sunday = addDays(monday, 6);

  return {
    todayISO: getLocalISODate(today),
    weekStartISO: getLocalISODate(monday),
    weekEndISO: getLocalISODate(sunday),
  };
}

function addDays(date: Date, amount: number) {
  const nextDate = new Date(date);

  nextDate.setDate(nextDate.getDate() + amount);

  return nextDate;
}

function parseLocalISODate(value: string) {
  const [year = "0", month = "1", day = "1"] = value.split("-");

  return new Date(Number(year), Number(month) - 1, Number(day));
}

function getLocalISODate(date: Date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatWeekDay(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatGeneratedAt(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}
