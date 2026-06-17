"use client";

import { useState, type FormEvent } from "react";
import type { TaskCreateInput, TaskPriority, TaskStatus } from "@/lib/tasks";
import { AppIcon } from "@/components/app-icon";

const CREATE_PRIORITIES: TaskPriority[] = ["High", "Medium", "Low", "Unknown"];
const CREATE_STATUSES: TaskStatus[] = [
  "Not Started",
  "In Progress",
  "Blocked",
  "Done",
  "Unknown",
];

type TaskCreateDraft = {
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

type TaskCreateDialogProps = {
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (input: TaskCreateInput) => Promise<void>;
};

export function TaskCreateDialog({
  isSaving,
  onClose,
  onSubmit,
}: TaskCreateDialogProps) {
  const [draft, setDraft] = useState<TaskCreateDraft>(() => getInitialDraft());

  const updateDraft = (key: keyof TaskCreateDraft, value: string) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [key]: value,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    await onSubmit({
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
    });
  };

  const handleClose = () => {
    if (!isSaving) {
      onClose();
    }
  };

  return (
    <div
      role="presentation"
      data-create-task-dialog="true"
      onClick={handleClose}
      className="fixed inset-0 z-[90] bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-task-title"
        onClick={(event) => event.stopPropagation()}
        className="ml-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-[#f9f4ec] shadow-2xl shadow-slate-950/25 sm:max-h-[calc(100vh-3rem)]"
      >
        <div className="border-b border-slate-200 bg-white/75 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">
                Google Sheet write-back
              </p>
              <h2
                id="create-task-title"
                className="mt-3 text-2xl font-black tracking-[-0.05em] text-slate-950"
              >
                Tạo task mới
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                Submit sẽ append một dòng mới vào Sheet rồi reload cache.
              </p>
            </div>
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

        <form onSubmit={handleSubmit} className="overflow-y-auto p-5">
          <div className="grid gap-4">
            <label className="grid gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
              Task *
              <input
                required
                value={draft.task}
                onChange={(event) => updateDraft("task", event.target.value)}
                disabled={isSaving}
                placeholder="Nhập tên task..."
                className="h-12 rounded-2xl border border-white bg-white px-4 text-base font-bold normal-case tracking-normal text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 disabled:cursor-wait disabled:opacity-60"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormTextInput
                disabled={isSaving}
                label="System"
                placeholder="FN, FL, BTS..."
                value={draft.system}
                onChange={(value) => updateDraft("system", value)}
              />
              <FormTextInput
                disabled={isSaving}
                label="Tags"
                placeholder="Collection, BTS..."
                value={draft.tags}
                onChange={(value) => updateDraft("tags", value)}
              />
              <label className="grid gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                Priority
                <select
                  value={draft.priority}
                  onChange={(event) =>
                    updateDraft("priority", event.target.value as TaskPriority)
                  }
                  disabled={isSaving}
                  className="h-12 rounded-2xl border border-white bg-white px-4 text-sm font-bold normal-case tracking-normal text-slate-800 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 disabled:cursor-wait disabled:opacity-60"
                >
                  {CREATE_PRIORITIES.map((priority) => (
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
                    updateDraft("status", event.target.value as TaskStatus)
                  }
                  disabled={isSaving}
                  className="h-12 rounded-2xl border border-white bg-white px-4 text-sm font-bold normal-case tracking-normal text-slate-800 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 disabled:cursor-wait disabled:opacity-60"
                >
                  {CREATE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <FormNumberInput
                disabled={isSaving}
                label="Timeline (ngày)"
                placeholder="VD: 3"
                value={draft.timeline}
                onChange={(value) => updateDraft("timeline", value)}
              />
              <FormDateInput
                disabled={isSaving}
                label="Date Received"
                value={draft.dateReceived}
                onChange={(value) => updateDraft("dateReceived", value)}
              />
              <FormDateInput
                disabled={isSaving}
                label="Deadline"
                value={draft.deadline}
                onChange={(value) => updateDraft("deadline", value)}
              />
              <div className="sm:col-span-2">
                <FormDateInput
                  disabled={isSaving}
                  label="Actual Date"
                  value={draft.actualDate}
                  onChange={(value) => updateDraft("actualDate", value)}
                />
              </div>
            </div>

            <FormTextarea
              disabled={isSaving}
              label="Details"
              placeholder="Mô tả yêu cầu, rule, expected behavior..."
              rows={4}
              value={draft.details}
              onChange={(value) => updateDraft("details", value)}
            />
            <FormTextarea
              disabled={isSaving}
              label="Note"
              placeholder="Ghi chú vận hành..."
              rows={3}
              value={draft.note}
              onChange={(value) => updateDraft("note", value)}
            />
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-[1.5rem] border border-teal-100 bg-teal-50/70 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold leading-6 text-teal-900">
              Task mới sẽ được append vào cuối bảng Google Sheet.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClose}
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
                  <AppIcon name="plus" className="size-4" />
                )}
                Tạo task
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

function FormTextInput({
  disabled,
  label,
  placeholder,
  value,
  onChange,
}: {
  disabled: boolean;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="h-12 rounded-2xl border border-white bg-white px-4 text-sm font-bold normal-case tracking-normal text-slate-800 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 disabled:cursor-wait disabled:opacity-60"
      />
    </label>
  );
}

function FormNumberInput({
  disabled,
  label,
  placeholder,
  value,
  onChange,
}: {
  disabled: boolean;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
      {label}
      <input
        type="number"
        min="0"
        step="1"
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
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
  placeholder,
  rows,
  value,
  onChange,
}: {
  disabled: boolean;
  label: string;
  placeholder: string;
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
        placeholder={placeholder}
        rows={rows}
        className="resize-y rounded-2xl border border-white bg-white px-4 py-3 text-sm font-medium normal-case leading-6 tracking-normal text-slate-800 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 disabled:cursor-wait disabled:opacity-60"
      />
    </label>
  );
}

function getInitialDraft(): TaskCreateDraft {
  return {
    tags: "",
    system: "",
    task: "",
    details: "",
    priority: "Medium",
    status: "Not Started",
    timeline: "",
    dateReceived: getTodayInputDate(),
    deadline: "",
    actualDate: "",
    note: "",
  };
}

function getTodayInputDate() {
  const date = new Date();

  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
