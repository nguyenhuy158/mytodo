"use client";

import type { ReactNode } from "react";
import type { SheetTask, TaskPriority, TaskStatus } from "@/lib/tasks";
import { cn } from "@/lib/utils";

export function TaskDetailDialog({
  task,
  onClose,
}: {
  task: SheetTask;
  onClose: () => void;
}) {
  const timelineItems = [
    {
      label: "Date Received",
      raw: task.dateReceived,
      iso: task.startDateISO,
    },
    {
      label: "Deadline",
      raw: task.deadline,
      iso: task.deadlineISO,
    },
    {
      label: "Actual Date",
      raw: task.actualDate,
      iso: task.actualDateISO,
    },
  ];

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-[80] bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-detail-title"
        onClick={(event) => event.stopPropagation()}
        className="ml-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-[#f9f4ec] shadow-2xl shadow-slate-950/25 sm:max-h-[calc(100vh-3rem)]"
      >
        <div className="border-b border-slate-200 bg-white/70 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">
                Task detail · Row {task.rowNumber}
              </p>
              <h2
                id="task-detail-title"
                className="mt-3 text-2xl font-black leading-tight tracking-[-0.05em] text-slate-950"
              >
                {task.task || "Untitled task"}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-teal-200 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200"
            >
              Đóng
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <StatusPill status={task.status} />
            <PriorityPill priority={task.priority} />
            <DetailBadge label="System" value={task.system} />
            <DetailBadge label="Tags" value={task.tags} />
          </div>
        </div>

        <div className="overflow-y-auto p-5">
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="grid gap-4">
              <DetailBlock title="Task">
                <p className="whitespace-pre-wrap text-base font-bold leading-7 text-slate-900">
                  {formatDetailValue(task.task)}
                </p>
              </DetailBlock>

              <DetailBlock title="Details">
                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {formatDetailValue(task.details)}
                </p>
              </DetailBlock>

              <DetailBlock title="Note">
                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {formatDetailValue(task.note)}
                </p>
              </DetailBlock>
            </section>

            <aside className="grid content-start gap-4">
              <section className="rounded-[1.5rem] border border-white/80 bg-white/80 p-4">
                <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                  Timeline
                </h3>
                <div className="mt-4 grid gap-3">
                  {timelineItems.map((item) => (
                    <DetailField
                      key={item.label}
                      label={item.label}
                      value={formatDetailDate(item.raw, item.iso)}
                    />
                  ))}
                </div>
              </section>

              <section className="rounded-[1.5rem] border border-white/80 bg-white/80 p-4">
                <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                  Status health
                </h3>
                <div className="mt-4 grid gap-3">
                  <DetailField
                    label="Days left"
                    value={formatDaysLeft(task.daysLeft, task.status)}
                  />
                  <DetailField
                    label="Overdue"
                    value={task.isOverdue ? "Yes" : "No"}
                  />
                  <DetailField label="Status" value={task.status} />
                  <DetailField label="Priority" value={task.priority} />
                </div>
              </section>

              <section className="rounded-[1.5rem] border border-white/80 bg-white/80 p-4">
                <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                  Sheet identity
                </h3>
                <div className="mt-4 grid gap-3">
                  <DetailField label="Row number" value={String(task.rowNumber)} />
                  <DetailField label="Task ID" value={task.id} />
                  <DetailField
                    label="System"
                    value={formatDetailValue(task.system)}
                  />
                  <DetailField label="Tags" value={formatDetailValue(task.tags)} />
                </div>
              </section>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}

function DetailBlock({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-[1.5rem] border border-white/80 bg-white/80 p-4">
      <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-slate-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-bold leading-6 text-slate-800">
        {value}
      </p>
    </div>
  );
}

function DetailBadge({ label, value }: { label: string; value: string }) {
  if (!value) {
    return null;
  }

  return (
    <span className="rounded-full bg-slate-100 px-2 py-1 text-[0.65rem] font-black text-slate-600">
      {label}: {value}
    </span>
  );
}

function StatusPill({ status }: { status: TaskStatus }) {
  const colors = {
    "In Progress": "bg-teal-100 text-teal-800",
    "Not Started": "bg-amber-100 text-amber-800",
    Done: "bg-emerald-100 text-emerald-800",
    Blocked: "bg-rose-100 text-rose-800",
    Unknown: "bg-slate-100 text-slate-600",
  } satisfies Record<TaskStatus, string>;

  return (
    <span
      className={cn(
        "rounded-full px-2 py-1 text-[0.65rem] font-black",
        colors[status],
      )}
    >
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
      className={cn(
        "rounded-full px-2 py-1 text-[0.65rem] font-black",
        colors[priority],
      )}
    >
      {priority}
    </span>
  );
}

function formatDetailValue(value: string) {
  return value.trim() || "Không có dữ liệu";
}

function formatDetailDate(raw: string, iso: string | null) {
  const rawValue = raw.trim();

  if (!rawValue && !iso) {
    return "Không có dữ liệu";
  }

  if (!iso) {
    return rawValue;
  }

  return rawValue ? `${rawValue} · ISO ${iso}` : `ISO ${iso}`;
}

function formatDaysLeft(daysLeft: number | null, status: TaskStatus) {
  if (status === "Done") {
    return "Done";
  }

  if (daysLeft === null) {
    return "Không có deadline";
  }

  if (daysLeft < 0) {
    return `Trễ ${Math.abs(daysLeft)} ngày`;
  }

  return `Còn ${daysLeft} ngày`;
}
