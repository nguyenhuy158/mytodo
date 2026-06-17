"use client";

import {
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import {
  formatTaskRowId,
  type SheetTask,
  type TaskPriority,
  type TaskStatus,
  type TaskUpdateInput,
} from "@/lib/tasks";
import { AppIcon } from "@/components/app-icon";
import { formatTaskTimeline } from "@/components/task-timeline";
import { cn } from "@/lib/utils";

const EDITABLE_PRIORITIES: TaskPriority[] = ["High", "Medium", "Low", "Unknown"];
const EDITABLE_STATUSES: TaskStatus[] = [
  "Not Started",
  "In Progress",
  "Blocked",
  "Done",
  "Unknown",
];

type TaskEditDraft = {
  tags: string;
  system: string;
  task: string;
  details: string;
  priority: TaskPriority;
  status: TaskStatus;
  timeline: string;
  dateReceived: string;
  deadline: string;
  actualDate: string;
  note: string;
};

type TaskEditDraftChange = <Key extends keyof TaskEditDraft>(
  key: Key,
  value: TaskEditDraft[Key],
) => void;

export function TaskDetailDialog({
  isSaving,
  task,
  onClose,
  onTaskUpdate,
}: {
  isSaving: boolean;
  task: SheetTask;
  onClose: () => void;
  onTaskUpdate: (input: TaskUpdateInput) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<TaskEditDraft>(() => toTaskEditDraft(task));
  const taskRowId = formatTaskRowId(task.rowNumber);
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

  const updateDraft: TaskEditDraftChange = (key, value) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [key]: value,
    }));
  };

  const handleClose = () => {
    if (!isSaving) {
      onClose();
    }
  };

  const handleOpenEditor = () => {
    setDraft(toTaskEditDraft(task));
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setDraft(toTaskEditDraft(task));
    setIsEditing(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    await onTaskUpdate({
      rowNumber: task.rowNumber,
      updates: {
        tags: draft.tags,
        system: draft.system,
        task: draft.task,
        details: draft.details,
        priority: draft.priority,
        status: draft.status,
        timeline: draft.timeline,
        dateReceived: draft.dateReceived,
        deadline: draft.deadline,
        actualDate: draft.actualDate,
        note: draft.note,
      },
    });

    setIsEditing(false);
  };

  return (
    <div
      role="presentation"
      onClick={handleClose}
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
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">
                Task detail · {taskRowId}
              </p>
              <h2
                id="task-detail-title"
                className="mt-3 text-2xl font-black leading-tight tracking-[-0.05em] text-slate-950"
              >
                {task.task || "Untitled task"}
              </h2>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={isEditing ? handleCancelEdit : handleOpenEditor}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-black text-teal-800 transition hover:border-teal-300 hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 disabled:cursor-wait disabled:opacity-60"
              >
                <AppIcon name="pencil" className="size-4" />
                {isEditing ? "Hủy edit" : "Edit"}
              </button>
              <button
                type="button"
                onClick={handleClose}
                disabled={isSaving}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-teal-200 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 disabled:cursor-wait disabled:opacity-60"
              >
                Đóng
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <StatusPill status={task.status} />
            <PriorityPill priority={task.priority} />
            <DetailBadge label="Timeline" value={formatTaskTimeline(task)} />
            <DetailBadge label="System" value={task.system} />
            <DetailBadge label="Tags" value={task.tags} />
          </div>
        </div>

        <div className="overflow-y-auto p-5">
          {isEditing ? (
            <TaskEditForm
              draft={draft}
              isSaving={isSaving}
              onCancel={handleCancelEdit}
              onDraftChange={updateDraft}
              onSubmit={handleSubmit}
            />
          ) : (
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
                      label="Timeline"
                      value={formatDetailValue(formatTaskTimeline(task))}
                    />
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
                    <DetailField label="Task ID" value={task.id} />
                    <DetailField label="Sheet row" value={String(task.rowNumber)} />
                    <DetailField
                      label="System"
                      value={formatDetailValue(task.system)}
                    />
                    <DetailField label="Tags" value={formatDetailValue(task.tags)} />
                  </div>
                </section>
              </aside>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function TaskEditForm({
  draft,
  isSaving,
  onCancel,
  onDraftChange,
  onSubmit,
}: {
  draft: TaskEditDraft;
  isSaving: boolean;
  onCancel: () => void;
  onDraftChange: TaskEditDraftChange;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <label className="grid gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
        Task *
        <input
          required
          value={draft.task}
          onChange={(event) => onDraftChange("task", event.target.value)}
          disabled={isSaving}
          className="h-12 rounded-2xl border border-white bg-white px-4 text-base font-bold normal-case tracking-normal text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 disabled:cursor-wait disabled:opacity-60"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormTextInput
          disabled={isSaving}
          label="System"
          value={draft.system}
          onChange={(value) => onDraftChange("system", value)}
        />
        <FormTextInput
          disabled={isSaving}
          label="Tags"
          value={draft.tags}
          onChange={(value) => onDraftChange("tags", value)}
        />
        <label className="grid gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
          Priority
          <select
            value={draft.priority}
            onChange={(event) =>
              onDraftChange("priority", event.target.value as TaskPriority)
            }
            disabled={isSaving}
            className="h-12 rounded-2xl border border-white bg-white px-4 text-sm font-bold normal-case tracking-normal text-slate-800 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 disabled:cursor-wait disabled:opacity-60"
          >
            {EDITABLE_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
          Status
          <select
            value={draft.status}
            onChange={(event) =>
              onDraftChange("status", event.target.value as TaskStatus)
            }
            disabled={isSaving}
            className="h-12 rounded-2xl border border-white bg-white px-4 text-sm font-bold normal-case tracking-normal text-slate-800 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 disabled:cursor-wait disabled:opacity-60"
          >
            {EDITABLE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <FormTextInput
          disabled={isSaving}
          inputMode="decimal"
          label="Timeline (ngày)"
          value={draft.timeline}
          onChange={(value) => onDraftChange("timeline", value)}
        />
        <FormDateInput
          disabled={isSaving}
          label="Date Received"
          value={draft.dateReceived}
          onChange={(value) => onDraftChange("dateReceived", value)}
        />
        <FormDateInput
          disabled={isSaving}
          label="Deadline"
          value={draft.deadline}
          onChange={(value) => onDraftChange("deadline", value)}
        />
        <FormDateInput
          disabled={isSaving}
          label="Actual Date"
          value={draft.actualDate}
          onChange={(value) => onDraftChange("actualDate", value)}
        />
      </div>

      <FormTextarea
        disabled={isSaving}
        label="Details"
        rows={5}
        value={draft.details}
        onChange={(value) => onDraftChange("details", value)}
      />
      <FormTextarea
        disabled={isSaving}
        label="Note"
        rows={4}
        value={draft.note}
        onChange={(value) => onDraftChange("note", value)}
      />

      <div className="flex flex-col gap-3 rounded-[1.5rem] border border-teal-100 bg-teal-50/70 p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-bold leading-6 text-teal-900">
          Lưu sẽ ghi trực tiếp vào row hiện tại trên Google Sheet.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600 transition hover:border-slate-300 disabled:cursor-wait disabled:opacity-60"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2 text-sm font-black text-white transition hover:bg-teal-900 disabled:cursor-wait disabled:opacity-70"
          >
            {isSaving ? (
              <AppIcon name="loader" className="size-4 animate-spin" />
            ) : (
              <AppIcon name="pencil" className="size-4" />
            )}
            Lưu task
          </button>
        </div>
      </div>
    </form>
  );
}

function FormTextInput({
  disabled,
  inputMode,
  label,
  value,
  onChange,
}: {
  disabled: boolean;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
      {label}
      <input
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-12 rounded-2xl border border-white bg-white px-4 text-sm font-bold normal-case tracking-normal text-slate-800 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 disabled:cursor-wait disabled:opacity-60"
      />
    </label>
  );
}

function FormDateInput({
  disabled,
  label,
  value,
  onChange,
}: {
  disabled: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
      {label}
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-12 rounded-2xl border border-white bg-white px-4 text-sm font-bold normal-case tracking-normal text-slate-800 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 disabled:cursor-wait disabled:opacity-60"
      />
    </label>
  );
}

function FormTextarea({
  disabled,
  label,
  rows,
  value,
  onChange,
}: {
  disabled: boolean;
  label: string;
  rows: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        rows={rows}
        className="resize-y rounded-2xl border border-white bg-white px-4 py-3 text-sm font-medium normal-case leading-6 tracking-normal text-slate-800 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 disabled:cursor-wait disabled:opacity-60"
      />
    </label>
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

function toTaskEditDraft(task: SheetTask): TaskEditDraft {
  return {
    tags: task.tags,
    system: task.system,
    task: task.task,
    details: task.details,
    priority: task.priority,
    status: task.status,
    timeline: task.timeline,
    dateReceived: task.startDateISO ?? "",
    deadline: task.deadlineISO ?? "",
    actualDate: task.actualDateISO ?? "",
    note: task.note,
  };
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
