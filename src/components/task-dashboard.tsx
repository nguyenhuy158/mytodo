"use client";

import Link from "next/link";
import { startTransition, useDeferredValue, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import useSWR from "swr";
import type {
  SheetTask,
  TaskPriority,
  TaskStatus,
  TaskUpdateInput,
  TasksPayload,
} from "@/lib/tasks";
import { AppIcon, type AppIconName } from "@/components/app-icon";
import { TaskDetailDialog } from "@/components/task-detail-dialog";
import { cn } from "@/lib/utils";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1Sv86oc9zXbvwSsD956uT4opSU8JqP04s/edit?gid=689856921#gid=689856921";
const TASKS_API_URL = "/api/tasks";
const TASKS_PER_PAGE = 12;

const STATUS_FILTERS: Array<TaskStatus | "All"> = [
  "All",
  "In Progress",
  "Not Started",
  "Done",
  "Blocked",
  "Unknown",
];
const EDITABLE_STATUSES: TaskStatus[] = STATUS_FILTERS.filter(
  (status): status is TaskStatus => status !== "All",
);
const EDITABLE_PRIORITIES: TaskPriority[] = [
  "High",
  "Medium",
  "Low",
  "Unknown",
];

type DeadlineFilter = "all" | "today" | "week";
type DashboardView = "overview" | "charts" | "tasks";

type TaskFetchError = Error & {
  payload?: {
    error?: {
      code?: string;
      message?: string;
    };
  };
};

const DEADLINE_FILTERS: Array<{
  value: DeadlineFilter;
  label: string;
}> = [
  { value: "all", label: "Tất cả deadline" },
  { value: "today", label: "Hôm nay" },
  { value: "week", label: "Tuần này T2-CN" },
];

const STATUS_COLORS: Record<TaskStatus, string> = {
  "In Progress": "#14b8a6",
  "Not Started": "#f59e0b",
  Done: "#22c55e",
  Blocked: "#f43f5e",
  Unknown: "#94a3b8",
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  High: "#ef4444",
  Medium: "#eab308",
  Low: "#38bdf8",
  Unknown: "#94a3b8",
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

export function TaskDashboard({ view = "overview" }: { view?: DashboardView }) {
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "All">("All");
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>("all");
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [savingRowNumber, setSavingRowNumber] = useState<number | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  const { data, error, mutate } = useSWR<TasksPayload>(
    TASKS_API_URL,
    fetcher,
    {
      refreshInterval: (latestData) => latestData?.meta.pollingMs ?? 15_000,
      revalidateOnFocus: true,
      keepPreviousData: true,
    },
  );

  const tasks = useMemo(() => data?.tasks ?? [], [data?.tasks]);
  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );
  const taskError = error as TaskFetchError | undefined;
  const charts = useMemo(() => buildChartData(tasks), [tasks]);
  const deadlineCounts = useMemo(() => buildDeadlineFilterCounts(tasks), [tasks]);
  const weekWindow = useMemo(() => getCurrentWeekWindow(), []);
  const filteredTasks = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    const dueWindow = getCurrentWeekWindow();

    return tasks
      .filter((task) => {
        const matchesStatus =
          statusFilter === "All" ? true : task.status === statusFilter;
        const matchesDeadline = matchesDeadlineFilter(
          task,
          deadlineFilter,
          dueWindow,
        );
        const matchesQuery = normalizedQuery
          ? [
              task.task,
              task.details,
              task.note,
              task.tags,
              task.system,
              task.priority,
              task.status,
            ]
              .join(" ")
              .toLowerCase()
              .includes(normalizedQuery)
          : true;

        return matchesStatus && matchesDeadline && matchesQuery;
      })
      .sort(compareTasksByNewestDateReceived);
  }, [deadlineFilter, deferredQuery, statusFilter, tasks]);

  const stats = useMemo(() => buildStats(tasks), [tasks]);
  const timeline = useMemo(() => buildTimeline(filteredTasks), [filteredTasks]);
  const pageCount = Math.max(1, Math.ceil(filteredTasks.length / TASKS_PER_PAGE));
  const visiblePage = Math.min(currentPage, pageCount);
  const pageStartIndex = filteredTasks.length
    ? (visiblePage - 1) * TASKS_PER_PAGE
    : 0;
  const pageEndIndex = Math.min(
    pageStartIndex + TASKS_PER_PAGE,
    filteredTasks.length,
  );
  const paginatedTasks = useMemo(
    () => filteredTasks.slice(pageStartIndex, pageEndIndex),
    [filteredTasks, pageEndIndex, pageStartIndex],
  );

  const handleStatusChange = (nextStatus: TaskStatus | "All") => {
    startTransition(() => {
      setStatusFilter(nextStatus);
      setCurrentPage(1);
    });
  };

  const handleDeadlineChange = (nextDeadline: DeadlineFilter) => {
    startTransition(() => {
      setDeadlineFilter(nextDeadline);
      setCurrentPage(1);
    });
  };

  const handleSearchChange = (nextQuery: string) => {
    setQuery(nextQuery);

    startTransition(() => {
      setCurrentPage(1);
    });
  };

  const handlePageChange = (nextPage: number) => {
    startTransition(() => {
      setCurrentPage(Math.min(Math.max(nextPage, 1), pageCount));
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
      const payload = await response.json();

      if (!response.ok) {
        const message =
          payload.error?.message ?? "Không cập nhật được Google Sheet.";

        throw Object.assign(new Error(message), { payload });
      }

      return payload as TasksPayload;
    });

    toast.promise(updatePromise, {
      loading: `Đang cập nhật row ${input.rowNumber}...`,
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
    <main className="min-h-[calc(100vh-8rem)] overflow-hidden bg-[radial-gradient(circle_at_top_left,#eff6c8_0,#f7f1e8_24rem,transparent_42rem),linear-gradient(135deg,#f8efe2_0%,#e8f0e6_46%,#dde8ef_100%)] text-slate-950">
      <section className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-6 sm:px-8 lg:px-10">
        <div className="pointer-events-none absolute inset-x-8 top-24 h-52 rounded-full bg-teal-500/10 blur-3xl" />

        {taskError ? (
          <SetupNotice
            code={taskError.payload?.error?.code}
            message={taskError.message}
          />
        ) : null}

        {view === "overview" ? (
          <>
            <MetricGrid stats={stats} visibleCount={filteredTasks.length} />
            <OverviewShortcuts />
          </>
        ) : null}

        {view === "charts" ? <ChartSection charts={charts} /> : null}

        {view === "tasks" ? (
          <TaskBoardSection
            deadlineCounts={deadlineCounts}
            deadlineFilter={deadlineFilter}
            filteredCount={filteredTasks.length}
            onDeadlineChange={handleDeadlineChange}
            onPageChange={handlePageChange}
            onSearchChange={handleSearchChange}
            onStatusChange={handleStatusChange}
            pageCount={pageCount}
            pageEndIndex={pageEndIndex}
            pageStartIndex={pageStartIndex}
            paginatedTasks={paginatedTasks}
            query={query}
            savingRowNumber={savingRowNumber}
            statusFilter={statusFilter}
            timeline={timeline}
            onTaskSelect={setSelectedTaskId}
            onTaskUpdate={handleTaskUpdate}
            visiblePage={visiblePage}
            weekWindow={weekWindow}
          />
        ) : null}
      </section>

      {selectedTask ? (
        <TaskDetailDialog
          task={selectedTask}
          onClose={() => setSelectedTaskId(null)}
        />
      ) : null}
    </main>
  );
}

function MetricGrid({
  stats,
  visibleCount,
}: {
  stats: ReturnType<typeof buildStats>;
  visibleCount: number;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        icon="sparkles"
        label="Tổng task"
        value={String(stats.total)}
        detail={`${stats.filteredVisible(visibleCount)} đang hiển thị`}
        tone="teal"
      />
      <MetricCard
        icon="clock"
        label="Đang làm"
        value={String(stats.inProgress)}
        detail="Status: In Progress"
        tone="amber"
      />
      <MetricCard
        icon="timerReset"
        label="Trễ hạn"
        value={String(stats.overdue)}
        detail="Deadline đã qua"
        tone="rose"
      />
      <MetricCard
        icon="checkCircle"
        label="Hoàn thành"
        value={String(stats.done)}
        detail="Status: Done"
        tone="emerald"
      />
    </div>
  );
}

function OverviewShortcuts() {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <OverviewShortcutCard
        description="Xem status, priority, workload và deadline health."
        href="/charts"
        label="Biểu đồ"
      />
      <OverviewShortcutCard
        description="Lọc, search, phân trang và xem timeline task."
        href="/tasks"
        label="Task board"
      />
      <OverviewShortcutCard
        description="Kanban theo status, kéo task để ghi status về Sheet."
        href="/kanban"
        label="Kanban"
      />
      <OverviewShortcutCard
        description="Task có deadline từ thứ 2 tới chủ nhật tuần này."
        href="/week"
        label="Task tuần này"
      />
      <a
        href={SHEET_URL}
        target="_blank"
        rel="noreferrer"
        className="group rounded-[1.6rem] border border-white/70 bg-slate-950 p-5 text-white shadow-xl shadow-slate-900/10 transition hover:-translate-y-1 hover:bg-teal-950"
      >
        <p className="text-sm font-black uppercase tracking-[0.22em] text-white/45">
          Google Sheet
        </p>
        <h2 className="mt-4 text-2xl font-black tracking-[-0.04em]">Mở Sheet</h2>
        <p className="mt-3 text-sm leading-6 text-white/60">
          Đi thẳng tới nguồn dữ liệu gốc.
        </p>
        <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-amber-200">
          Open
          <AppIcon
            name="externalLink"
            className="size-4 transition group-hover:translate-x-1"
          />
        </span>
      </a>
    </section>
  );
}

function OverviewShortcutCard({
  description,
  href,
  label,
}: {
  description: string;
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[1.6rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-900/10 backdrop-blur transition hover:-translate-y-1 hover:border-teal-200 hover:bg-white"
    >
      <p className="text-sm font-black uppercase tracking-[0.22em] text-teal-700">
        Page
      </p>
      <h2 className="mt-4 text-2xl font-black tracking-[-0.04em] text-slate-950">
        {label}
      </h2>
      <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
      <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-slate-950">
        Mở trang
        <AppIcon
          name="externalLink"
          className="size-4 transition group-hover:translate-x-1"
        />
      </span>
    </Link>
  );
}

function TaskBoardSection({
  deadlineCounts,
  deadlineFilter,
  filteredCount,
  onDeadlineChange,
  onPageChange,
  onSearchChange,
  onStatusChange,
  pageCount,
  pageEndIndex,
  pageStartIndex,
  paginatedTasks,
  query,
  savingRowNumber,
  statusFilter,
  timeline,
  onTaskSelect,
  onTaskUpdate,
  visiblePage,
  weekWindow,
}: {
  deadlineCounts: Record<DeadlineFilter, number>;
  deadlineFilter: DeadlineFilter;
  filteredCount: number;
  onDeadlineChange: (deadline: DeadlineFilter) => void;
  onPageChange: (page: number) => void;
  onSearchChange: (query: string) => void;
  onStatusChange: (status: TaskStatus | "All") => void;
  pageCount: number;
  pageEndIndex: number;
  pageStartIndex: number;
  paginatedTasks: SheetTask[];
  query: string;
  savingRowNumber: number | null;
  statusFilter: TaskStatus | "All";
  timeline: TimelineWindow;
  onTaskSelect: (taskId: string) => void;
  onTaskUpdate: (input: TaskUpdateInput) => Promise<void>;
  visiblePage: number;
  weekWindow: DueWindow;
}) {
  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-4 shadow-2xl shadow-slate-900/10 backdrop-blur md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-teal-700">
            Live Board
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
            Task line từ Google Sheet
          </h2>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            Đang hiển thị theo filter: {filteredCount} task
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative">
            <AppIcon
              name="search"
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              value={query}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Tìm task, tag, note..."
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white/85 pl-11 pr-4 text-sm font-medium outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 sm:w-72"
            />
          </label>
          <a
            href={SHEET_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-teal-900"
          >
            Mở Sheet
            <AppIcon name="externalLink" className="size-4" />
          </a>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <AppIcon name="filter" className="size-4 text-slate-400" />
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => onStatusChange(status)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-bold transition",
              statusFilter === status
                ? "border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-900/15"
                : "border-white bg-white/70 text-slate-600 hover:border-teal-200 hover:text-teal-800",
            )}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="mt-3 flex min-w-0 flex-col gap-3 overflow-hidden rounded-3xl border border-slate-200 bg-white/55 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-2 text-sm font-bold text-slate-600">
          <AppIcon name="calendarClock" className="mt-0.5 size-4 shrink-0 text-teal-700" />
          <span className="min-w-0 leading-snug">
            Deadline tuần này: {formatShortDate(weekWindow.weekStartISO)} -{" "}
            {formatShortDate(weekWindow.weekEndISO)}
          </span>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap">
          {DEADLINE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => onDeadlineChange(filter.value)}
              className={cn(
                "inline-flex min-w-0 items-center justify-center rounded-full border px-4 py-2 text-sm font-bold transition",
                deadlineFilter === filter.value
                  ? "border-teal-900 bg-teal-900 text-white shadow-lg shadow-teal-900/15"
                  : "border-white bg-white/80 text-slate-600 hover:border-teal-200 hover:text-teal-800",
              )}
            >
              {filter.label}
              <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs">
                {deadlineCounts[filter.value]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <TimelineBoard
        tasks={paginatedTasks}
        timeline={timeline}
        savingRowNumber={savingRowNumber}
        onTaskSelect={onTaskSelect}
        onTaskUpdate={onTaskUpdate}
      />
      <PaginationControls
        currentPage={visiblePage}
        pageCount={pageCount}
        pageEndIndex={pageEndIndex}
        pageStartIndex={pageStartIndex}
        totalItems={filteredCount}
        onPageChange={onPageChange}
      />
    </section>
  );
}

function SetupNotice({ code, message }: { code?: string; message: string }) {
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
          <p className="mt-2 text-sm leading-6">
            {isConfigError
              ? "Share Google Sheet cho email service account với quyền Editor, rồi điền `.env.local`. Sheet vẫn private, browser không thấy key."
              : "Kiểm tra format Sheet/XLSX hoặc bấm Reload để đọc lại dữ liệu mới nhất."}
          </p>
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: AppIconName;
  label: string;
  value: string;
  detail: string;
  tone: "teal" | "amber" | "rose" | "emerald";
}) {
  const toneClass = {
    teal: "from-teal-500 to-cyan-500",
    amber: "from-amber-400 to-orange-500",
    rose: "from-rose-500 to-red-500",
    emerald: "from-emerald-500 to-lime-500",
  }[tone];

  return (
    <article className="relative overflow-hidden rounded-[1.6rem] border border-white/70 bg-white/70 p-5 shadow-xl shadow-slate-900/10 backdrop-blur">
      <div
        className={cn(
          "absolute -right-10 -top-10 size-28 rounded-full bg-gradient-to-br opacity-20 blur-xl",
          toneClass,
        )}
      />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">
            {label}
          </p>
          <p className="mt-3 text-5xl font-black tracking-[-0.07em] text-slate-950">
            {value}
          </p>
          <p className="mt-2 text-sm font-medium text-slate-500">{detail}</p>
        </div>
        <div
          className={cn(
            "rounded-2xl bg-gradient-to-br p-3 text-white shadow-lg",
            toneClass,
          )}
        >
          <AppIcon name={icon} className="size-5" />
        </div>
      </div>
    </article>
  );
}

function ChartSection({ charts }: { charts: DashboardCharts }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <ChartCard
        title="Status flow"
        subtitle="Tỉ lệ vận hành theo trạng thái"
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={charts.status} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#64748b", fontSize: 12, fontWeight: 700 }}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              width={34}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} />
            <Bar dataKey="value" radius={[10, 10, 0, 0]}>
              {charts.status.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Priority mix"
        subtitle="Mức ưu tiên trên toàn bộ sheet"
      >
        <div className="grid min-h-[260px] gap-4 sm:grid-cols-[1fr_0.9fr] sm:items-center">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={charts.priority}
                dataKey="value"
                nameKey="name"
                innerRadius={58}
                outerRadius={88}
                paddingAngle={3}
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={3}
              >
                {charts.priority.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <ChartLegend data={charts.priority} />
        </div>
      </ChartCard>

      <ChartCard
        title="System workload"
        subtitle="Top hệ thống có nhiều task nhất"
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={charts.systems}
            layout="vertical"
            margin={{ top: 12, right: 20, left: 10, bottom: 0 }}
          >
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#94a3b8", fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#475569", fontSize: 12, fontWeight: 800 }}
              width={72}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(20, 184, 166, 0.06)" }} />
            <Bar dataKey="value" fill="#0f766e" radius={[0, 10, 10, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Deadline health"
        subtitle="Tình trạng deadline hiện tại"
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={charts.deadlines} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#64748b", fontSize: 12, fontWeight: 700 }}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              width={34}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} />
            <Bar dataKey="value" radius={[10, 10, 0, 0]}>
              {charts.deadlines.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </section>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <article className="overflow-hidden rounded-[1.6rem] border border-white/70 bg-white/70 p-5 shadow-xl shadow-slate-900/10 backdrop-blur">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-[-0.04em] text-slate-950">
            {title}
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
          Chart
        </span>
      </div>
      {children}
    </article>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: ChartDatum }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0]?.payload;
  const name = item?.name ?? label ?? "";
  const value = payload[0]?.value ?? item?.value ?? 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-xl shadow-slate-900/10">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
        {name}
      </p>
      <p className="mt-1 text-2xl font-black tracking-[-0.06em] text-slate-950">
        {value}
      </p>
    </div>
  );
}

function ChartLegend({ data }: { data: ChartDatum[] }) {
  return (
    <div className="grid gap-2">
      {data.map((item) => (
        <div
          key={item.name}
          className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="truncate text-sm font-bold text-slate-700">
              {item.name}
            </span>
          </div>
          <span className="text-sm font-black text-slate-950">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function TimelineBoard({
  tasks,
  timeline,
  savingRowNumber,
  onTaskSelect,
  onTaskUpdate,
}: {
  tasks: SheetTask[];
  timeline: TimelineWindow;
  savingRowNumber: number | null;
  onTaskSelect: (taskId: string) => void;
  onTaskUpdate: (input: TaskUpdateInput) => Promise<void>;
}) {
  if (!tasks.length) {
    return (
      <div className="mt-6 rounded-[1.5rem] border border-dashed border-slate-300 bg-white/60 p-8 text-center">
        <p className="text-lg font-black text-slate-800">
          Chưa có task để hiển thị
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Khi API đọc được sheet, danh sách task sẽ tự hiện ở đây.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50/80">
      <div className="grid grid-cols-[minmax(18rem,1.1fr)_minmax(24rem,1fr)] border-b border-slate-200 bg-white/80 text-xs font-black uppercase tracking-[0.2em] text-slate-500 max-lg:hidden">
        <div className="px-5 py-4">Task</div>
        <div className="px-5 py-4">Timeline</div>
      </div>
      <div className="max-h-[62vh] overflow-auto">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            timeline={timeline}
            isSaving={savingRowNumber === task.rowNumber}
            onTaskSelect={() => onTaskSelect(task.id)}
            onTaskUpdate={onTaskUpdate}
          />
        ))}
      </div>
    </div>
  );
}

function PaginationControls({
  currentPage,
  pageCount,
  pageStartIndex,
  pageEndIndex,
  totalItems,
  onPageChange,
}: {
  currentPage: number;
  pageCount: number;
  pageStartIndex: number;
  pageEndIndex: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}) {
  if (totalItems <= TASKS_PER_PAGE) {
    return null;
  }

  const pages = getPaginationPages(currentPage, pageCount);

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-[1.5rem] border border-slate-200 bg-white/70 p-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-bold text-slate-600">
        Hiển thị {pageStartIndex + 1}-{pageEndIndex} / {totalItems} task
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-teal-200 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Trước
        </button>
        {pages.map((page) => (
          <button
            key={page}
            type="button"
            onClick={() => onPageChange(page)}
            className={cn(
              "size-10 rounded-full border text-sm font-black transition",
              page === currentPage
                ? "border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-900/15"
                : "border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:text-teal-800",
            )}
          >
            {page}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === pageCount}
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-teal-200 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Sau
        </button>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  timeline,
  isSaving,
  onTaskSelect,
  onTaskUpdate,
}: {
  task: SheetTask;
  timeline: TimelineWindow;
  isSaving: boolean;
  onTaskSelect: () => void;
  onTaskUpdate: (input: TaskUpdateInput) => Promise<void>;
}) {
  const position = getTaskPosition(task, timeline);
  const [isEditing, setIsEditing] = useState(false);
  const [draftStatus, setDraftStatus] = useState<TaskStatus>(task.status);
  const [draftPriority, setDraftPriority] = useState<TaskPriority>(
    task.priority,
  );
  const [draftActualDate, setDraftActualDate] = useState(
    task.actualDateISO ?? "",
  );
  const [draftNote, setDraftNote] = useState(task.note);

  const resetDraft = () => {
    setDraftStatus(task.status);
    setDraftPriority(task.priority);
    setDraftActualDate(task.actualDateISO ?? "");
    setDraftNote(task.note);
  };

  const handleOpenEditor = () => {
    resetDraft();
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    resetDraft();
    setIsEditing(false);
  };

  const handleRowKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const target = event.target;

    if (
      target instanceof HTMLElement &&
      target.closest("button,a,input,select,textarea,form")
    ) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onTaskSelect();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    await onTaskUpdate({
      rowNumber: task.rowNumber,
      updates: {
        status: draftStatus,
        priority: draftPriority,
        actualDate: draftActualDate,
        note: draftNote,
      },
    });

    setIsEditing(false);
  };

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Xem chi tiết task: ${task.task}`}
      data-task-row="true"
      data-row-number={task.rowNumber}
      onClick={onTaskSelect}
      onKeyDown={handleRowKeyDown}
      className="grid cursor-pointer gap-0 border-b border-slate-200 bg-white/70 transition hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 lg:grid-cols-[minmax(18rem,1.1fr)_minmax(24rem,1fr)]"
    >
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={task.status} />
          <PriorityPill priority={task.priority} />
          {task.system ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
              {task.system}
            </span>
          ) : null}
          {task.tags ? (
            <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-black text-teal-800">
              {task.tags}
            </span>
          ) : null}
        </div>
        <h3 className="mt-3 text-lg font-black leading-tight tracking-[-0.03em] text-slate-950">
          {task.task}
        </h3>
        {task.details ? (
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
            {task.details}
          </p>
        ) : null}
        {task.note ? (
          <p className="mt-3 rounded-2xl bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-700">
            {task.note}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();

              if (isEditing) {
                handleCancelEdit();
              } else {
                handleOpenEditor();
              }
            }}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:border-teal-200 hover:text-teal-800 disabled:cursor-wait disabled:opacity-60"
          >
            {isSaving ? (
              <AppIcon name="loader" className="size-3.5 animate-spin" />
            ) : (
              <AppIcon name="pencil" className="size-3.5" />
            )}
            {isEditing ? "Đóng form" : "Sửa Sheet"}
          </button>
          <span className="text-xs font-bold text-slate-400">
            Row {task.rowNumber}
          </span>
          <span className="text-xs font-black text-teal-700">
            Click để xem chi tiết
          </span>
        </div>
        {isEditing ? (
          <form
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onSubmit={handleSubmit}
            className="mt-4 rounded-[1.25rem] border border-teal-100 bg-teal-50/60 p-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                Status
                <select
                  value={draftStatus}
                  onChange={(event) =>
                    setDraftStatus(event.target.value as TaskStatus)
                  }
                  disabled={isSaving}
                  className="h-10 rounded-2xl border border-white bg-white px-3 text-sm font-bold normal-case tracking-normal text-slate-800 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 disabled:cursor-wait disabled:opacity-60"
                >
                  {EDITABLE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                Priority
                <select
                  value={draftPriority}
                  onChange={(event) =>
                    setDraftPriority(event.target.value as TaskPriority)
                  }
                  disabled={isSaving}
                  className="h-10 rounded-2xl border border-white bg-white px-3 text-sm font-bold normal-case tracking-normal text-slate-800 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 disabled:cursor-wait disabled:opacity-60"
                >
                  {EDITABLE_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-slate-500 sm:col-span-2">
                Actual Date
                <input
                  type="date"
                  value={draftActualDate}
                  onChange={(event) => setDraftActualDate(event.target.value)}
                  disabled={isSaving}
                  className="h-10 rounded-2xl border border-white bg-white px-3 text-sm font-bold normal-case tracking-normal text-slate-800 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 disabled:cursor-wait disabled:opacity-60"
                />
              </label>
            </div>
            <label className="mt-3 grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
              Note
              <textarea
                value={draftNote}
                onChange={(event) => setDraftNote(event.target.value)}
                disabled={isSaving}
                rows={3}
                className="resize-y rounded-2xl border border-white bg-white px-3 py-2 text-sm font-medium normal-case leading-6 tracking-normal text-slate-800 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 disabled:cursor-wait disabled:opacity-60"
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-teal-800">
                Lưu sẽ ghi ngược về Google Sheet.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCancelEdit();
                  }}
                  disabled={isSaving}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600 transition hover:border-slate-300 disabled:cursor-wait disabled:opacity-60"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white transition hover:bg-teal-900 disabled:cursor-wait disabled:opacity-70"
                >
                  {isSaving ? (
                    <AppIcon name="loader" className="size-3.5 animate-spin" />
                  ) : null}
                  Lưu Sheet
                </button>
              </div>
            </div>
          </form>
        ) : null}
      </div>

      <div className="flex flex-col justify-center gap-3 border-t border-slate-100 p-5 lg:border-l lg:border-t-0">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="font-bold text-slate-700">
            {task.dateReceived || "No start"} → {task.deadline || "No deadline"}
          </div>
          <div
            className={cn(
              "rounded-full px-3 py-1 text-xs font-black",
              task.isOverdue
                ? "bg-rose-100 text-rose-700"
                : "bg-emerald-100 text-emerald-700",
            )}
          >
            {task.daysLeft === null
              ? "No date"
              : task.daysLeft < 0
                ? `Trễ ${Math.abs(task.daysLeft)} ngày`
                : `Còn ${task.daysLeft} ngày`}
          </div>
        </div>
        <div className="relative h-12 rounded-2xl bg-slate-200/80 p-1">
          <div
            className="absolute bottom-1 top-1 w-px bg-slate-950/30"
            style={{ left: `${timeline.todayPercent}%` }}
          />
          {position ? (
            <div
              className={cn(
                "absolute bottom-1 top-1 min-w-3 rounded-xl bg-gradient-to-r shadow-lg",
                task.status === "Done"
                  ? "from-emerald-400 to-lime-500"
                  : task.isOverdue
                    ? "from-rose-500 to-orange-500"
                    : "from-teal-500 to-cyan-500",
              )}
              style={{
                left: `${position.left}%`,
                width: `${position.width}%`,
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs font-bold text-slate-400">
              Thiếu Date Rec hoặc Deadline
            </div>
          )}
        </div>
        <div className="flex justify-between text-xs font-bold text-slate-400">
          <span>{formatShortDate(timeline.startISO)}</span>
          <span>Hôm nay</span>
          <span>{formatShortDate(timeline.endISO)}</span>
        </div>
      </div>
    </article>
  );
}

function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-xs font-black",
        status === "In Progress" && "bg-lime-200 text-lime-900",
        status === "Not Started" && "bg-amber-100 text-amber-800",
        status === "Done" && "bg-emerald-100 text-emerald-700",
        status === "Blocked" && "bg-rose-100 text-rose-700",
        status === "Unknown" && "bg-slate-100 text-slate-600",
      )}
    >
      {status}
    </span>
  );
}

function PriorityPill({ priority }: { priority: TaskPriority }) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-xs font-black",
        priority === "High" && "bg-red-100 text-red-700",
        priority === "Medium" && "bg-yellow-200 text-yellow-900",
        priority === "Low" && "bg-sky-100 text-sky-700",
        priority === "Unknown" && "bg-slate-100 text-slate-500",
      )}
    >
      {priority}
    </span>
  );
}

type TimelineWindow = {
  startISO: string;
  endISO: string;
  todayPercent: number;
};

type DueWindow = {
  todayISO: string;
  weekStartISO: string;
  weekEndISO: string;
};

type ChartDatum = {
  name: string;
  value: number;
  color: string;
};

type DashboardCharts = {
  status: ChartDatum[];
  priority: ChartDatum[];
  systems: ChartDatum[];
  deadlines: ChartDatum[];
};

function buildTimeline(tasks: SheetTask[]): TimelineWindow {
  const todayISO = getLocalISODate(new Date());
  const dates = tasks.flatMap((task) =>
    [task.startDateISO, task.deadlineISO, todayISO].filter(Boolean),
  ) as string[];
  const sorted = dates.sort();
  const startISO = sorted[0] ?? todayISO;
  const endISO = sorted[sorted.length - 1] ?? todayISO;

  return {
    startISO,
    endISO,
    todayPercent: getPercent(todayISO, startISO, endISO),
  };
}

function getTaskPosition(task: SheetTask, timeline: TimelineWindow) {
  if (!task.startDateISO || !task.deadlineISO) {
    return null;
  }

  const left = getPercent(task.startDateISO, timeline.startISO, timeline.endISO);
  const right = getPercent(task.deadlineISO, timeline.startISO, timeline.endISO);

  return {
    left,
    width: Math.max(right - left, 2),
  };
}

function getPercent(valueISO: string, startISO: string, endISO: string) {
  const start = Date.parse(`${startISO}T00:00:00Z`);
  const end = Date.parse(`${endISO}T00:00:00Z`);
  const value = Date.parse(`${valueISO}T00:00:00Z`);

  if (start === end) {
    return 50;
  }

  return Math.min(100, Math.max(0, ((value - start) / (end - start)) * 100));
}

function buildStats(tasks: SheetTask[]) {
  return {
    total: tasks.length,
    inProgress: tasks.filter((task) => task.status === "In Progress").length,
    done: tasks.filter((task) => task.status === "Done").length,
    overdue: tasks.filter((task) => task.isOverdue).length,
    filteredVisible: (value: number) => `${value}/${tasks.length}`,
  };
}

function compareTasksByNewestDateReceived(left: SheetTask, right: SheetTask) {
  const leftTime = getDateReceivedTime(left);
  const rightTime = getDateReceivedTime(right);

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return right.rowNumber - left.rowNumber;
}

function getDateReceivedTime(task: SheetTask) {
  return task.startDateISO ? Date.parse(`${task.startDateISO}T00:00:00Z`) : 0;
}

function getPaginationPages(currentPage: number, pageCount: number) {
  const maxVisiblePages = 5;
  const halfWindow = Math.floor(maxVisiblePages / 2);
  const startPage = Math.max(
    1,
    Math.min(currentPage - halfWindow, pageCount - maxVisiblePages + 1),
  );
  const endPage = Math.min(pageCount, startPage + maxVisiblePages - 1);

  return Array.from(
    { length: endPage - startPage + 1 },
    (_, index) => startPage + index,
  );
}

function buildDeadlineFilterCounts(tasks: SheetTask[]) {
  const dueWindow = getCurrentWeekWindow();

  return {
    all: tasks.length,
    today: tasks.filter((task) =>
      matchesDeadlineFilter(task, "today", dueWindow),
    ).length,
    week: tasks.filter((task) => matchesDeadlineFilter(task, "week", dueWindow))
      .length,
  } satisfies Record<DeadlineFilter, number>;
}

function matchesDeadlineFilter(
  task: SheetTask,
  deadlineFilter: DeadlineFilter,
  dueWindow: DueWindow,
) {
  if (deadlineFilter === "all") {
    return true;
  }

  if (task.status === "Done" || !task.deadlineISO) {
    return false;
  }

  if (deadlineFilter === "today") {
    return task.deadlineISO === dueWindow.todayISO;
  }

  return (
    task.deadlineISO >= dueWindow.weekStartISO &&
    task.deadlineISO <= dueWindow.weekEndISO
  );
}

function getCurrentWeekWindow(): DueWindow {
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

function getLocalISODate(date: Date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function buildChartData(tasks: SheetTask[]): DashboardCharts {
  return {
    status: buildStatusChart(tasks),
    priority: buildPriorityChart(tasks),
    systems: buildSystemChart(tasks),
    deadlines: buildDeadlineChart(tasks),
  };
}

function buildStatusChart(tasks: SheetTask[]) {
  return STATUS_FILTERS.filter((status): status is TaskStatus => status !== "All")
    .map((status) => ({
      name: status,
      value: tasks.filter((task) => task.status === status).length,
      color: STATUS_COLORS[status],
    }))
    .filter((item) => item.value > 0);
}

function buildPriorityChart(tasks: SheetTask[]) {
  const priorities: TaskPriority[] = ["High", "Medium", "Low", "Unknown"];

  return priorities
    .map((priority) => ({
      name: priority,
      value: tasks.filter((task) => task.priority === priority).length,
      color: PRIORITY_COLORS[priority],
    }))
    .filter((item) => item.value > 0);
}

function buildSystemChart(tasks: SheetTask[]) {
  const counts = new Map<string, number>();

  for (const task of tasks) {
    const system = task.system || "No system";

    counts.set(system, (counts.get(system) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, value]) => ({
      name,
      value,
      color: "#0f766e",
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

function buildDeadlineChart(tasks: SheetTask[]) {
  const done = tasks.filter((task) => task.status === "Done").length;
  const overdue = tasks.filter((task) => task.isOverdue).length;
  const upcoming = tasks.filter(
    (task) =>
      task.status !== "Done" &&
      typeof task.daysLeft === "number" &&
      task.daysLeft >= 0 &&
      task.daysLeft <= 7,
  ).length;
  const noDate = tasks.filter((task) => !task.deadlineISO).length;

  return [
    { name: "Done", value: done, color: "#22c55e" },
    { name: "Overdue", value: overdue, color: "#f43f5e" },
    { name: "7 days", value: upcoming, color: "#f59e0b" },
    { name: "No date", value: noDate, color: "#94a3b8" },
  ].filter((item) => item.value > 0);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${value}T00:00:00Z`));
}
