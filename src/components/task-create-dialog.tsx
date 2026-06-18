"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import {
  useForm,
  useWatch,
  type Path,
  type PathValue,
} from "react-hook-form";
import { z } from "zod";
import type { TaskCreateInput, TaskPriority, TaskStatus } from "@/lib/tasks";
import { AppIcon } from "@/components/app-icon";
import { DatePickerField } from "@/components/date-picker-field";

const TASK_CREATE_DRAFT_STORAGE_KEY = "mytodo:create-task:draft";
const TASK_CREATE_OPEN_STORAGE_KEY = "mytodo:create-task:open";
const TASK_CREATE_OPEN_VALUE = "1";
const TASK_CREATE_DRAFT_VERSION = 1;
const CREATE_PRIORITIES = ["High", "Medium", "Low", "Unknown"] as const satisfies readonly TaskPriority[];
const CREATE_STATUSES = [
  "Not Started",
  "In Progress",
  "Blocked",
  "Done",
  "Unknown",
] as const satisfies readonly TaskStatus[];
const optionalISODateSchema = z
  .string()
  .regex(/^$|^\d{4}-\d{2}-\d{2}$/, "Ngày phải đúng format yyyy-mm-dd.");
const taskCreateSchema = z.object({
  actualDate: optionalISODateSchema,
  dateReceived: optionalISODateSchema,
  deadline: optionalISODateSchema,
  details: z.string(),
  note: z.string(),
  priority: z.enum(CREATE_PRIORITIES),
  status: z.enum(CREATE_STATUSES),
  system: z.string(),
  tags: z.string(),
  task: z.string().trim().min(1, "Nhập tên task."),
  timeline: z.string(),
});

type TaskCreateDraft = z.infer<typeof taskCreateSchema>;

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
  const form = useForm<TaskCreateDraft>({
    defaultValues: readSavedDraft() ?? getInitialDraft(),
    resolver: zodResolver(taskCreateSchema),
  });
  const draft = useWatch({ control: form.control }) as TaskCreateDraft;
  const taskError = form.formState.errors.task?.message;

  useEffect(() => {
    markTaskCreateDialogOpen();
  }, []);

  useEffect(() => {
    saveTaskCreateDraft(draft);
  }, [draft]);

  const updateDraft = <Key extends Path<TaskCreateDraft>>(
    key: Key,
    value: PathValue<TaskCreateDraft, Key>,
  ) => {
    form.setValue(key, value, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit({
      tags: values.tags,
      system: values.system,
      task: values.task,
      details: values.details,
      priority: values.priority,
      status: values.status,
      timeline: values.timeline,
      dateReceived: values.dateReceived,
      deadline: values.deadline,
      actualDate: values.actualDate,
      note: values.note,
    });
    clearSavedTaskCreateDialog();
  });

  const handleClose = () => {
    if (!isSaving) {
      clearSavedTaskCreateDialog();
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
              {taskError ? (
                <span className="text-xs font-black normal-case tracking-normal text-rose-700">
                  {taskError}
                </span>
              ) : null}
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

export function markTaskCreateDialogOpen() {
  try {
    window.localStorage.setItem(
      TASK_CREATE_OPEN_STORAGE_KEY,
      TASK_CREATE_OPEN_VALUE,
    );
  } catch {
    // Local storage may be unavailable in restricted browser modes.
  }
}

export function shouldRestoreTaskCreateDialog() {
  try {
    return (
      window.localStorage.getItem(TASK_CREATE_OPEN_STORAGE_KEY) ===
      TASK_CREATE_OPEN_VALUE
    );
  } catch {
    return false;
  }
}

export function clearSavedTaskCreateDialog() {
  try {
    window.localStorage.removeItem(TASK_CREATE_OPEN_STORAGE_KEY);
    window.localStorage.removeItem(TASK_CREATE_DRAFT_STORAGE_KEY);
  } catch {
    // Local storage may be unavailable in restricted browser modes.
  }
}

function saveTaskCreateDraft(draft: TaskCreateDraft) {
  try {
    window.localStorage.setItem(
      TASK_CREATE_DRAFT_STORAGE_KEY,
      JSON.stringify({
        draft,
        version: TASK_CREATE_DRAFT_VERSION,
      }),
    );
  } catch {
    // Local storage may be unavailable in restricted browser modes.
  }
}

function readSavedDraft() {
  try {
    const rawDraft = window.localStorage.getItem(TASK_CREATE_DRAFT_STORAGE_KEY);

    if (!rawDraft) {
      return null;
    }

    const value = JSON.parse(rawDraft) as unknown;

    if (!isSavedTaskCreateDraft(value)) {
      return null;
    }

    return value.draft;
  } catch {
    return null;
  }
}

function isSavedTaskCreateDraft(
  value: unknown,
): value is { draft: TaskCreateDraft; version: number } {
  if (!isRecord(value) || value.version !== TASK_CREATE_DRAFT_VERSION) {
    return false;
  }

  return isTaskCreateDraft(value.draft);
}

function isTaskCreateDraft(value: unknown): value is TaskCreateDraft {
  return (
    isRecord(value) &&
    typeof value.tags === "string" &&
    typeof value.system === "string" &&
    typeof value.task === "string" &&
    typeof value.details === "string" &&
    isTaskPriority(value.priority) &&
    isTaskStatus(value.status) &&
    typeof value.timeline === "string" &&
    typeof value.dateReceived === "string" &&
    typeof value.deadline === "string" &&
    typeof value.actualDate === "string" &&
    typeof value.note === "string"
  );
}

function isTaskPriority(value: unknown): value is TaskPriority {
  return (
    typeof value === "string" &&
    CREATE_PRIORITIES.includes(value as TaskPriority)
  );
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === "string" && CREATE_STATUSES.includes(value as TaskStatus)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    <DatePickerField
      disabled={disabled}
      label={label}
      value={value}
      onChange={onChange}
    />
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
