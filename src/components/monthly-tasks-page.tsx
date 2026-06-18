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
  formatTaskRowId,
  type SheetTask,
  type TaskPriority,
  type TaskStatus,
  type TaskUpdateInput,
  type TasksPayload,
} from "@/lib/tasks";
import { AppIcon } from "@/components/app-icon";
import { TaskDetailDialog } from "@/components/task-detail-dialog";
import { TaskTimelinePill } from "@/components/task-timeline";
import { usePersistedTaskSelection } from "@/components/use-persisted-task-selection";
import { cn } from "@/lib/utils";

const TASKS_API_URL = "/api/tasks";
const MONTH_SELECTION_STORAGE_KEY = "mytodo:selected-task:/month";

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

type TaskFetchError = Error & {
  payload?: {
    error?: {
      code?: string;
      message?: string;
    };
  };
};

type MonthWindow = {
  endISO: string;
  label: string;
  monthValue: string;
  startISO: string;
};

type MonthWeek = {
  endISO: string;
  label: string;
  startISO: string;
  tasks: SheetTask[];
};

type MonthStats = {
  active: number;
  done: number;
  high: number;
  overdue: number;
  total: number;
};

type BreakdownItem = {
  count: number;
  label: string;
};

const fetcher = async (url: string): Promise<TasksPayload> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await readJsonResponse(response, "Không đọc được dữ liệu task.");

  if (!response.ok) {
    throwTaskError(payload, "Không đọc được dữ liệu task.");
  }

  return payload as TasksPayload;
};

export function MonthlyTasksPage() {
  const [monthValue, setMonthValue] = useState(getCurrentMonthValue);
  const [query, setQuery] = useState("");
  const [savingRowNumber, setSavingRowNumber] = useState<number | null>(null);
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

  const tasks = useMemo(() => data?.tasks ?? [], [data?.tasks]);
  const [selectedTaskId, setSelectedTaskId] = usePersistedTaskSelection({
    isReady: Boolean(data),
    storageKey: MONTH_SELECTION_STORAGE_KEY,
    tasks,
  });
  const monthWindow = useMemo(() => getMonthWindow(monthValue), [monthValue]);
  const monthTasks = useMemo(
    () => tasks.filter((task) => isTaskInMonth(task, monthWindow)),
    [monthWindow, tasks],
  );
  const filteredTasks = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    return monthTasks
      .filter((task) =>
        normalizedQuery ? matchesQuery(task, normalizedQuery) : true,
      )
      .sort(compareMonthTasks);
  }, [deferredQuery, monthTasks]);
  const stats = useMemo(() => buildMonthStats(filteredTasks), [filteredTasks]);
  const weeks = useMemo(
    () => buildMonthWeeks(monthWindow, filteredTasks),
    [filteredTasks, monthWindow],
  );
  const breakdown = useMemo(
    () => buildMonthBreakdown(filteredTasks),
    [filteredTasks],
  );
  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );
  const taskError = error as TaskFetchError | undefined;

  const handleMonthChange = (nextMonthValue: string) => {
    startTransition(() => {
      setMonthValue(normalizeMonthValue(nextMonthValue));
    });
  };

  const handleSearchChange = (nextQuery: string) => {
    startTransition(() => {
      setQuery(nextQuery);
    });
  };

  const handleTaskUpdate = async (input: TaskUpdateInput) => {
    setSavingRowNumber(input.rowNumber);

    const updatePromise = fetch(TASKS_API_URL, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }).then(async (response) => {
      const payload = await readJsonResponse(
        response,
        "Không cập nhật được Google Sheet.",
      );

      if (!response.ok) {
        throwTaskError(payload, "Không cập nhật được Google Sheet.");
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
    } finally {
      setSavingRowNumber(null);
    }
  };

  return (
    <main className="min-h-[calc(100vh-8rem)] overflow-hidden bg-[radial-gradient(circle_at_18%_12%,#d7f4ec_0,#f5efe4_28rem,transparent_50rem),linear-gradient(135deg,#f8efe2_0%,#e7f2ed_48%,#dce8f0_100%)] text-slate-950">
      <section className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <div className="pointer-events-none absolute inset-x-10 top-28 h-64 rounded-full bg-teal-400/10 blur-3xl" />

        {taskError ? (
          <ErrorNotice
            code={taskError.payload?.error?.code}
            message={taskError.message}
          />
        ) : null}

        <section className="relative z-10 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MonthlyMetricCard
            label="Task tháng"
            value={String(stats.total)}
            detail={`${filteredTasks.length}/${monthTasks.length} đang hiển thị`}
            tone="teal"
          />
          <MonthlyMetricCard
            label="Chưa xong"
            value={String(stats.active)}
            detail="Status khác Done"
            tone="slate"
          />
          <MonthlyMetricCard
            label="Trễ hạn"
            value={String(stats.overdue)}
            detail="Chưa Done và quá deadline"
            tone="rose"
          />
          <MonthlyMetricCard
            label="High priority"
            value={String(stats.high)}
            detail="Cần ưu tiên trong tháng"
            tone="amber"
          />
          <MonthlyMetricCard
            label="Done"
            value={String(stats.done)}
            detail="Đã hoàn thành"
            tone="emerald"
          />
        </section>

        <section className="relative z-10 rounded-[2rem] border border-white/70 bg-white/75 p-4 shadow-2xl shadow-slate-900/10 backdrop-blur md:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-teal-700">
                Monthly Overview
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                Tổng quan {monthWindow.label}
              </h2>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                Task được tính theo deadline nằm trong tháng đã chọn.
              </p>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/85 p-1">
                <button
                  type="button"
                  onClick={() => handleMonthChange(shiftMonth(monthValue, -1))}
                  className="flex size-10 items-center justify-center rounded-xl text-lg font-black text-slate-600 transition hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
                  aria-label="Tháng trước"
                >
                  ‹
                </button>
                <input
                  type="month"
                  value={monthValue}
                  onChange={(event) => handleMonthChange(event.target.value)}
                  className="h-10 min-w-36 rounded-xl border border-transparent bg-white px-3 text-sm font-black text-slate-800 outline-none transition focus:border-teal-300 focus:ring-4 focus:ring-teal-100"
                />
                <button
                  type="button"
                  onClick={() => handleMonthChange(shiftMonth(monthValue, 1))}
                  className="flex size-10 items-center justify-center rounded-xl text-lg font-black text-slate-600 transition hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
                  aria-label="Tháng sau"
                >
                  ›
                </button>
              </div>
              <label className="relative">
                <AppIcon
                  name="search"
                  className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={query}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  placeholder="Tìm task trong tháng..."
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white/85 pl-11 pr-4 text-sm font-medium outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 lg:w-80"
                />
              </label>
            </div>
          </div>

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
            <MonthOverviewGrid
              breakdown={breakdown}
              monthLabel={monthWindow.label}
              onTaskSelect={setSelectedTaskId}
              weeks={weeks}
            />
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

type MetricTone = "amber" | "emerald" | "rose" | "slate" | "teal";

function MonthlyMetricCard({
  detail,
  label,
  tone,
  value,
}: {
  detail: string;
  label: string;
  tone: MetricTone;
  value: string;
}) {
  const toneClasses = {
    amber: "from-amber-400/20 to-orange-400/10 text-amber-800",
    emerald: "from-emerald-400/20 to-lime-400/10 text-emerald-800",
    rose: "from-rose-400/15 to-orange-400/10 text-rose-800",
    slate: "from-slate-900/10 to-slate-400/10 text-slate-800",
    teal: "from-teal-500/15 to-cyan-500/10 text-teal-800",
  } satisfies Record<MetricTone, string>;

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

function MonthOverviewGrid({
  breakdown,
  monthLabel,
  onTaskSelect,
  weeks,
}: {
  breakdown: ReturnType<typeof buildMonthBreakdown>;
  monthLabel: string;
  onTaskSelect: (taskId: string) => void;
  weeks: MonthWeek[];
}) {
  const hasTasks = weeks.some((week) => week.tasks.length > 0);

  return (
    <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="grid gap-3">
        {hasTasks ? (
          weeks.map((week) => (
            <MonthWeekSection
              key={week.startISO}
              onTaskSelect={onTaskSelect}
              week={week}
            />
          ))
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white/60 p-8 text-center">
            <p className="text-lg font-black text-slate-800">
              Không có task trong {monthLabel}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Các task có deadline trong tháng này sẽ hiện ở đây.
            </p>
          </div>
        )}
      </section>

      <aside className="grid content-start gap-3">
        <BreakdownPanel items={breakdown.status} label="Theo status" />
        <BreakdownPanel items={breakdown.priority} label="Theo priority" />
        <BreakdownPanel items={breakdown.system} label="Top system" />
      </aside>
    </div>
  );
}

function MonthWeekSection({
  onTaskSelect,
  week,
}: {
  onTaskSelect: (taskId: string) => void;
  week: MonthWeek;
}) {
  const activeCount = week.tasks.filter((task) => task.status !== "Done").length;
  const overdueCount = week.tasks.filter(
    (task) => task.status !== "Done" && task.isOverdue,
  ).length;

  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-black text-slate-950">{week.label}</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {formatShortDate(week.startISO)} - {formatShortDate(week.endISO)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CountPill label="Task" value={week.tasks.length} />
          <CountPill label="Chưa xong" value={activeCount} />
          <CountPill label="Trễ" tone="rose" value={overdueCount} />
        </div>
      </div>

      {week.tasks.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {week.tasks.map((task) => (
            <MonthTaskCard
              key={task.id}
              task={task}
              onClick={() => onTaskSelect(task.id)}
            />
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl bg-white/70 p-4 text-sm font-semibold text-slate-400">
          Không có deadline trong tuần này.
        </p>
      )}
    </section>
  );
}

function CountPill({
  label,
  tone = "slate",
  value,
}: {
  label: string;
  tone?: "rose" | "slate";
  value: number;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-xs font-black",
        tone === "rose"
          ? "bg-rose-100 text-rose-800"
          : "bg-white text-slate-600",
      )}
    >
      {label}: {value}
    </span>
  );
}

function MonthTaskCard({
  onClick,
  task,
}: {
  onClick: () => void;
  task: SheetTask;
}) {
  const isDone = task.status === "Done";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Xem chi tiết task: ${task.task}`}
      className={cn(
        "w-full min-w-0 rounded-2xl border bg-white p-3 text-left shadow-sm shadow-slate-900/5 transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200",
        isDone
          ? "border-slate-200 bg-slate-100/80 text-slate-500 opacity-50 grayscale shadow-none hover:translate-y-0 hover:border-slate-200 hover:shadow-none"
          : "opacity-100",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "rounded-full bg-slate-100 px-2 py-1 text-[0.65rem] font-black text-slate-600",
            isDone && "bg-slate-200 text-slate-500",
          )}
        >
          {task.id}
        </span>
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
          "mt-2 break-words text-sm font-black leading-snug text-slate-950",
          isDone && "text-slate-500 line-through decoration-slate-400/80",
        )}
      >
        {task.task}
      </h4>
      <p
        className={cn(
          "mt-2 break-words text-xs font-bold leading-5 text-slate-500",
          isDone && "text-slate-400",
        )}
      >
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
            "mt-2 line-clamp-3 break-words rounded-xl bg-slate-50 p-2 text-xs leading-5 text-slate-600",
            isDone && "bg-slate-200/70 text-slate-400",
          )}
        >
          {task.note}
        </p>
      ) : null}
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

function BreakdownPanel({
  items,
  label,
}: {
  items: BreakdownItem[];
  label: string;
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className="rounded-[1.5rem] border border-white/80 bg-white/80 p-4 shadow-sm shadow-slate-900/5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">
          {label}
        </h3>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-500">
          {total}
        </span>
      </div>

      {items.length ? (
        <div className="mt-4 grid gap-3">
          {items.map((item) => {
            const width = total ? Math.round((item.count / total) * 100) : 0;

            return (
              <div key={item.label}>
                <div className="flex items-center justify-between gap-3 text-sm font-bold">
                  <span className="min-w-0 truncate text-slate-700">
                    {item.label}
                  </span>
                  <span className="text-slate-500">{item.count}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-teal-500"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-400">
          Chưa có dữ liệu.
        </p>
      )}
    </section>
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

function buildMonthStats(tasks: SheetTask[]): MonthStats {
  return {
    active: tasks.filter((task) => task.status !== "Done").length,
    done: tasks.filter((task) => task.status === "Done").length,
    high: tasks.filter(
      (task) => task.priority === "High" && task.status !== "Done",
    ).length,
    overdue: tasks.filter((task) => task.status !== "Done" && task.isOverdue)
      .length,
    total: tasks.length,
  };
}

function buildMonthBreakdown(tasks: SheetTask[]) {
  return {
    priority: countBreakdown(tasks, (task) => task.priority),
    status: countBreakdown(tasks, (task) => task.status),
    system: countBreakdown(tasks, (task) => task.system || "No system").slice(
      0,
      8,
    ),
  };
}

function countBreakdown(
  tasks: SheetTask[],
  getLabel: (task: SheetTask) => string,
): BreakdownItem[] {
  const counts = new Map<string, number>();

  for (const task of tasks) {
    const label = getLabel(task).trim() || "Unknown";

    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ count, label }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function buildMonthWeeks(
  monthWindow: MonthWindow,
  tasks: SheetTask[],
): MonthWeek[] {
  const monthStart = parseLocalISODate(monthWindow.startISO);
  const monthEnd = parseLocalISODate(monthWindow.endISO);
  const day = monthStart.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  let cursor = addDays(monthStart, mondayOffset);
  const weeks: MonthWeek[] = [];
  let weekIndex = 1;

  while (cursor <= monthEnd) {
    const weekStart = cursor;
    const weekEnd = addDays(weekStart, 6);
    const visibleStart = weekStart < monthStart ? monthStart : weekStart;
    const visibleEnd = weekEnd > monthEnd ? monthEnd : weekEnd;
    const startISO = getLocalISODate(visibleStart);
    const endISO = getLocalISODate(visibleEnd);

    weeks.push({
      endISO,
      label: `Tuần ${weekIndex}`,
      startISO,
      tasks: tasks.filter(
        (task) =>
          task.deadlineISO &&
          task.deadlineISO >= startISO &&
          task.deadlineISO <= endISO,
      ),
    });

    cursor = addDays(cursor, 7);
    weekIndex += 1;
  }

  return weeks;
}

function matchesQuery(task: SheetTask, normalizedQuery: string) {
  return [
    task.id,
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

function isTaskInMonth(task: SheetTask, monthWindow: MonthWindow) {
  return Boolean(
    task.deadlineISO &&
      task.deadlineISO >= monthWindow.startISO &&
      task.deadlineISO <= monthWindow.endISO,
  );
}

function compareMonthTasks(left: SheetTask, right: SheetTask) {
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

  const deadlineDiff = getDeadlineTime(left) - getDeadlineTime(right);

  if (deadlineDiff !== 0) {
    return deadlineDiff;
  }

  return getDateReceivedTime(right) - getDateReceivedTime(left);
}

function getDateReceivedTime(task: SheetTask) {
  return task.startDateISO ? Date.parse(`${task.startDateISO}T00:00:00Z`) : 0;
}

function getDeadlineTime(task: SheetTask) {
  return task.deadlineISO ? Date.parse(`${task.deadlineISO}T00:00:00Z`) : 0;
}

function getMonthWindow(value: string): MonthWindow {
  const normalizedValue = normalizeMonthValue(value);
  const [yearText, monthText] = normalizedValue.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const startDate = new Date(year, monthIndex, 1);
  const endDate = new Date(year, monthIndex + 1, 0);

  return {
    endISO: getLocalISODate(endDate),
    label: formatMonthTitle(startDate),
    monthValue: normalizedValue,
    startISO: getLocalISODate(startDate),
  };
}

function normalizeMonthValue(value: string) {
  return /^\d{4}-\d{2}$/.test(value) ? value : getCurrentMonthValue();
}

function getCurrentMonthValue() {
  return getLocalMonthValue(new Date());
}

function shiftMonth(value: string, amount: number) {
  const [yearText, monthText] = normalizeMonthValue(value).split("-");
  const date = new Date(Number(yearText), Number(monthText) - 1 + amount, 1);

  return getLocalMonthValue(date);
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

function getLocalMonthValue(date: Date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
  ].join("-");
}

function formatMonthTitle(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${value}T00:00:00Z`));
}

async function readJsonResponse(response: Response, fallbackMessage: string) {
  const text = await response.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `${fallbackMessage} Server trả response không phải JSON (${response.status} ${response.statusText}).`,
    );
  }
}

function throwTaskError(payload: unknown, fallbackMessage: string): never {
  const message =
    isRecord(payload) &&
    isRecord(payload.error) &&
    typeof payload.error.message === "string"
      ? payload.error.message
      : fallbackMessage;

  throw Object.assign(new Error(message), { payload });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
