"use client";

import { startTransition, useDeferredValue, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import type {
  SheetTask,
  TaskPriority,
  TaskStatus,
  TasksPayload,
} from "@/lib/tasks";
import { AppIcon } from "@/components/app-icon";
import { TaskDetailDialog } from "@/components/task-detail-dialog";
import { TaskTimelinePill } from "@/components/task-timeline";
import { cn } from "@/lib/utils";

const TASKS_API_URL = "/api/tasks";

const STATUS_COLUMNS: Array<{
  status: TaskStatus;
  title: string;
  description: string;
  tone: string;
}> = [
  {
    status: "Not Started",
    title: "Backlog",
    description: "Chưa bắt đầu",
    tone: "bg-amber-100 text-amber-800 border-amber-200",
  },
  {
    status: "In Progress",
    title: "Doing",
    description: "Đang xử lý",
    tone: "bg-teal-100 text-teal-800 border-teal-200",
  },
  {
    status: "Blocked",
    title: "Blocked",
    description: "Đang kẹt",
    tone: "bg-rose-100 text-rose-800 border-rose-200",
  },
  {
    status: "Done",
    title: "Done",
    description: "Hoàn tất",
    tone: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  {
    status: "Unknown",
    title: "Unknown",
    description: "Thiếu status rõ ràng",
    tone: "bg-slate-100 text-slate-700 border-slate-200",
  },
];

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
  Unknown: 3,
};

type TaskFetchError = Error & {
  payload?: {
    error?: {
      code?: string;
      message?: string;
    };
  };
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

export function KanbanTasksPage() {
  const [query, setQuery] = useState("");
  const [savingRowNumber, setSavingRowNumber] = useState<number | null>(null);
  const [draggingRowNumber, setDraggingRowNumber] = useState<number | null>(null);
  const [dropTargetStatus, setDropTargetStatus] = useState<TaskStatus | null>(
    null,
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
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
  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );
  const taskError = error as TaskFetchError | undefined;
  const filteredTasks = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    return tasks
      .filter((task) =>
        normalizedQuery ? matchesQuery(task, normalizedQuery) : true,
      )
      .sort(compareKanbanTasks);
  }, [deferredQuery, tasks]);
  const columnTasks = useMemo(
    () => buildColumnTasks(filteredTasks),
    [filteredTasks],
  );
  const stats = useMemo(() => buildKanbanStats(tasks), [tasks]);

  const handleSearchChange = (nextQuery: string) => {
    startTransition(() => {
      setQuery(nextQuery);
    });
  };

  const handleStatusUpdate = async (
    task: SheetTask,
    nextStatus: TaskStatus,
  ) => {
    if (task.status === nextStatus || savingRowNumber !== null) {
      return;
    }

    setSavingRowNumber(task.rowNumber);

    const updatePromise = fetch(TASKS_API_URL, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        rowNumber: task.rowNumber,
        updates: {
          status: nextStatus,
        },
      }),
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
      loading: `Đang chuyển row ${task.rowNumber} sang ${nextStatus}...`,
      success: `Đã chuyển sang ${nextStatus}.`,
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
      setDraggingRowNumber(null);
      setDropTargetStatus(null);
    }
  };

  const handleDragStart = (
    event: React.DragEvent<HTMLElement>,
    task: SheetTask,
  ) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(task.rowNumber));
    setDraggingRowNumber(task.rowNumber);
  };

  const handleDragEnd = () => {
    setDraggingRowNumber(null);
    setDropTargetStatus(null);
  };

  const handleDragOver = (
    event: React.DragEvent<HTMLElement>,
    nextStatus: TaskStatus,
  ) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    if (draggingRowNumber !== null) {
      setDropTargetStatus(nextStatus);
    }
  };

  const handleDragLeave = (
    event: React.DragEvent<HTMLElement>,
    status: TaskStatus,
  ) => {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setDropTargetStatus((currentStatus) =>
      currentStatus === status ? null : currentStatus,
    );
  };

  const handleDrop = (
    event: React.DragEvent<HTMLElement>,
    nextStatus: TaskStatus,
  ) => {
    event.preventDefault();
    setDropTargetStatus(null);

    const rowNumber = Number(event.dataTransfer.getData("text/plain"));
    const task = tasks.find((item) => item.rowNumber === rowNumber);

    if (!task) {
      setDraggingRowNumber(null);

      return;
    }

    void handleStatusUpdate(task, nextStatus);
  };

  return (
    <main className="min-h-[calc(100vh-8rem)] overflow-hidden bg-[radial-gradient(circle_at_20%_0%,#d9f5eb_0,#f8efe2_24rem,transparent_46rem),linear-gradient(135deg,#f8efe2_0%,#eaf1e7_48%,#dbe9f0_100%)] text-slate-950">
      <section className="relative mx-auto flex w-full max-w-[95rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <div className="pointer-events-none absolute inset-x-8 top-24 h-56 rounded-full bg-teal-500/10 blur-3xl" />

        {taskError ? (
          <ErrorNotice
            code={taskError.payload?.error?.code}
            message={taskError.message}
          />
        ) : null}

        <section className="relative z-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Tổng task"
            value={String(stats.total)}
            detail={`${stats.active} task chưa Done`}
            tone="teal"
          />
          <MetricCard
            label="Doing"
            value={String(stats.inProgress)}
            detail="Status: In Progress"
            tone="amber"
          />
          <MetricCard
            label="Blocked"
            value={String(stats.blocked)}
            detail="Cần xử lý vướng mắc"
            tone="rose"
          />
          <MetricCard
            label="Done"
            value={String(stats.done)}
            detail="Đã hoàn tất"
            tone="emerald"
          />
        </section>

        <section className="relative z-10 rounded-[2rem] border border-white/70 bg-white/75 p-4 shadow-2xl shadow-slate-900/10 backdrop-blur md:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-teal-700">
                Kanban Board
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                Kéo task qua column để đổi status
              </h2>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                Lọc hiện tại: {filteredTasks.length}/{tasks.length} task
              </p>
            </div>
            <label className="relative">
              <AppIcon
                name="search"
                className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              />
              <input
                value={query}
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder="Tìm task, note, tag..."
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white/85 pl-11 pr-4 text-sm font-medium outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 sm:w-96"
              />
            </label>
          </div>

          {isLoading && !data ? (
            <LoadingBoard />
          ) : (
            <div className="mt-6 flex gap-4 overflow-x-auto pb-3">
              {STATUS_COLUMNS.map((column) => (
                <KanbanColumn
                  key={column.status}
                  column={column}
                  draggingRowNumber={draggingRowNumber}
                  isDropTarget={dropTargetStatus === column.status}
                  savingRowNumber={savingRowNumber}
                  tasks={columnTasks[column.status]}
                  onDragEnd={handleDragEnd}
                  onDragLeave={(event) => handleDragLeave(event, column.status)}
                  onDragOver={(event) => handleDragOver(event, column.status)}
                  onDragStart={handleDragStart}
                  onDrop={(event) => handleDrop(event, column.status)}
                  onTaskSelect={setSelectedTaskId}
                  onStatusUpdate={handleStatusUpdate}
                />
              ))}
            </div>
          )}
        </section>
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

function KanbanColumn({
  column,
  draggingRowNumber,
  isDropTarget,
  savingRowNumber,
  tasks,
  onDragEnd,
  onDragLeave,
  onDragOver,
  onDragStart,
  onDrop,
  onTaskSelect,
  onStatusUpdate,
}: {
  column: (typeof STATUS_COLUMNS)[number];
  draggingRowNumber: number | null;
  isDropTarget: boolean;
  savingRowNumber: number | null;
  tasks: SheetTask[];
  onDragEnd: () => void;
  onDragLeave: (event: React.DragEvent<HTMLElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLElement>) => void;
  onDragStart: (event: React.DragEvent<HTMLElement>, task: SheetTask) => void;
  onDrop: (event: React.DragEvent<HTMLElement>) => void;
  onTaskSelect: (taskId: string) => void;
  onStatusUpdate: (task: SheetTask, status: TaskStatus) => Promise<void>;
}) {
  return (
    <section
      data-drop-active={isDropTarget ? "true" : "false"}
      data-kanban-column={column.status}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "min-h-[34rem] w-[19rem] shrink-0 rounded-[1.5rem] border p-3 transition lg:w-[21rem]",
        isDropTarget
          ? "border-teal-400 bg-teal-50/80 shadow-2xl shadow-teal-900/10 ring-4 ring-teal-100"
          : "border-slate-200 bg-slate-50/80",
      )}
    >
      <div className="sticky top-0 z-10 mb-3 rounded-[1.2rem] border border-white/80 bg-white/90 p-3 shadow-sm shadow-slate-900/5 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-black tracking-[-0.04em] text-slate-950">
              {column.title}
            </h3>
            <p className="mt-1 text-xs font-bold text-slate-500">
              {column.description}
            </p>
          </div>
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-black",
              column.tone,
            )}
          >
            {tasks.length}
          </span>
        </div>
      </div>

      {isDropTarget ? (
        <div className="mb-3 rounded-[1.2rem] border border-dashed border-teal-300 bg-white/80 p-4 text-center text-sm font-black text-teal-800">
          Thả vào đây để chuyển sang {column.title}
        </div>
      ) : null}

      <div className="grid gap-3">
        {tasks.length ? (
          tasks.map((task) => (
            <KanbanCard
              key={task.id}
              task={task}
              draggingRowNumber={draggingRowNumber}
              isSaving={savingRowNumber === task.rowNumber}
              onDragEnd={onDragEnd}
              onDragStart={onDragStart}
              onTaskSelect={onTaskSelect}
              onStatusUpdate={onStatusUpdate}
            />
          ))
        ) : (
          <div className="rounded-[1.2rem] border border-dashed border-slate-200 bg-white/70 p-5 text-center">
            <p className="text-sm font-black text-slate-400">Không có task</p>
          </div>
        )}
      </div>
    </section>
  );
}

function KanbanCard({
  task,
  draggingRowNumber,
  isSaving,
  onDragEnd,
  onDragStart,
  onTaskSelect,
  onStatusUpdate,
}: {
  task: SheetTask;
  draggingRowNumber: number | null;
  isSaving: boolean;
  onDragEnd: () => void;
  onDragStart: (event: React.DragEvent<HTMLElement>, task: SheetTask) => void;
  onTaskSelect: (taskId: string) => void;
  onStatusUpdate: (task: SheetTask, status: TaskStatus) => Promise<void>;
}) {
  const isDragging = draggingRowNumber === task.rowNumber;

  const handleOpenDetail = () => {
    if (!isDragging && !isSaving) {
      onTaskSelect(task.id);
    }
  };

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const target = event.target;

    if (
      target instanceof HTMLElement &&
      target.closest("button,a,input,select,textarea")
    ) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    handleOpenDetail();
  };

  return (
    <article
      role="button"
      tabIndex={0}
      aria-grabbed={isDragging}
      aria-label={`Xem chi tiết task: ${task.task}`}
      data-kanban-card="true"
      data-row-number={task.rowNumber}
      draggable={!isSaving}
      onClick={handleOpenDetail}
      onDragEnd={onDragEnd}
      onDragStart={(event) => onDragStart(event, task)}
      onKeyDown={handleCardKeyDown}
      className={cn(
        "cursor-grab rounded-[1.25rem] border border-white bg-white p-4 shadow-lg shadow-slate-900/8 transition active:cursor-grabbing",
        "hover:-translate-y-0.5 hover:border-teal-100 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200",
        isDragging && "opacity-50 ring-4 ring-teal-100",
        isSaving && "cursor-wait opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <PriorityPill priority={task.priority} />
          <TaskTimelinePill
            task={task}
            className="px-2 py-1 text-[0.65rem]"
          />
          {task.system ? (
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[0.65rem] font-black text-slate-600">
              {task.system}
            </span>
          ) : null}
          {task.tags ? (
            <span className="rounded-full bg-teal-50 px-2 py-1 text-[0.65rem] font-black text-teal-800">
              {task.tags}
            </span>
          ) : null}
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[0.65rem] font-black text-slate-400">
          <AppIcon name="grip" className="size-3.5" />
          Kéo
        </span>
      </div>
      <h4 className="mt-3 text-base font-black leading-snug tracking-[-0.03em] text-slate-950">
        {task.task}
      </h4>
      {task.details ? (
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
          {task.details}
        </p>
      ) : null}
      <div className="mt-3 grid gap-2 rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-500">
        <span>Row {task.rowNumber}</span>
        <span>Rec: {task.dateReceived || "No start"}</span>
        <span>Due: {task.deadline || "No deadline"}</span>
      </div>
      {task.daysLeft !== null && task.status !== "Done" ? (
        <p
          className={cn(
            "mt-3 rounded-2xl px-3 py-2 text-xs font-black",
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
        <p className="mt-3 line-clamp-3 rounded-2xl bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900/80">
          {task.note}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {STATUS_COLUMNS.filter((column) => column.status !== task.status).map(
          (column) => (
            <button
              key={column.status}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void onStatusUpdate(task, column.status);
              }}
              disabled={isSaving}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 transition hover:border-teal-200 hover:text-teal-800 disabled:cursor-wait disabled:opacity-50"
            >
              {isSaving ? "Đang lưu..." : column.title}
            </button>
          ),
        )}
      </div>
    </article>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "teal" | "amber" | "rose" | "emerald";
}) {
  const toneClasses = {
    teal: "from-teal-500/15 to-cyan-500/10 text-teal-800",
    amber: "from-amber-400/20 to-orange-400/10 text-amber-800",
    rose: "from-rose-400/15 to-orange-400/10 text-rose-800",
    emerald: "from-emerald-400/15 to-lime-400/10 text-emerald-800",
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

function PriorityPill({ priority }: { priority: TaskPriority }) {
  const colors = {
    High: "bg-rose-100 text-rose-700",
    Medium: "bg-yellow-100 text-yellow-800",
    Low: "bg-sky-100 text-sky-700",
    Unknown: "bg-slate-100 text-slate-500",
  } satisfies Record<TaskPriority, string>;

  return (
    <span
      className={cn("rounded-full px-2 py-1 text-[0.65rem] font-black", colors[priority])}
    >
      {priority}
    </span>
  );
}

function LoadingBoard() {
  return (
    <div className="mt-6 rounded-[1.5rem] border border-dashed border-slate-300 bg-white/60 p-8 text-center">
      <AppIcon
        name="loader"
        className="mx-auto size-6 animate-spin text-teal-700"
      />
      <p className="mt-3 text-sm font-bold text-slate-500">
        Đang đọc task từ cache/API...
      </p>
    </div>
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
          <p className="mt-2 text-sm leading-6">
            {isConfigError
              ? "Share Google Sheet cho email service account với quyền Editor, rồi điền `.env.local`."
              : "Kiểm tra format Sheet/XLSX hoặc bấm Reload để đọc lại dữ liệu mới nhất."}
          </p>
        </div>
      </div>
    </section>
  );
}

function buildColumnTasks(tasks: SheetTask[]) {
  return Object.fromEntries(
    STATUS_COLUMNS.map((column) => [
      column.status,
      tasks.filter((task) => task.status === column.status),
    ]),
  ) as Record<TaskStatus, SheetTask[]>;
}

function buildKanbanStats(tasks: SheetTask[]) {
  return {
    total: tasks.length,
    active: tasks.filter((task) => task.status !== "Done").length,
    inProgress: tasks.filter((task) => task.status === "In Progress").length,
    blocked: tasks.filter((task) => task.status === "Blocked").length,
    done: tasks.filter((task) => task.status === "Done").length,
  };
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

function compareKanbanTasks(left: SheetTask, right: SheetTask) {
  const priorityDiff =
    PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];

  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  if (left.isOverdue !== right.isOverdue) {
    return left.isOverdue ? -1 : 1;
  }

  return getDateReceivedTime(right) - getDateReceivedTime(left);
}

function getDateReceivedTime(task: SheetTask) {
  return task.startDateISO ? Date.parse(`${task.startDateISO}T00:00:00Z`) : 0;
}
