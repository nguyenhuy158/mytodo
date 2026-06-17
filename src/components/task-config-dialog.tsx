"use client";

import {
  useEffect,
  useMemo,
  useState,
  type InputHTMLAttributes,
} from "react";
import { toast } from "sonner";
import type {
  TaskConfigCategory,
  TaskConfigItem,
  TaskConfigsPayload,
} from "@/lib/tasks";
import { AppIcon } from "@/components/app-icon";
import { cn } from "@/lib/utils";

const TASK_CONFIG_API_URL = "/api/task-config";
const CONFIG_CATEGORIES: Array<{ id: TaskConfigCategory; label: string }> = [
  { id: "status", label: "Status" },
  { id: "priority", label: "Priority" },
  { id: "system", label: "System" },
  { id: "tags", label: "Tags" },
];

type ConfigDraft = {
  value: string;
  label: string;
  order: string;
  isActive: boolean;
};

const emptyDraft: ConfigDraft = {
  value: "",
  label: "",
  order: "",
  isActive: true,
};

export function TaskConfigDialog({ onClose }: { onClose: () => void }) {
  const [payload, setPayload] = useState<TaskConfigsPayload | null>(null);
  const [activeCategory, setActiveCategory] =
    useState<TaskConfigCategory>("status");
  const [createDraft, setCreateDraft] = useState<ConfigDraft>(emptyDraft);
  const [editDraft, setEditDraft] = useState<ConfigDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const activeItems = useMemo(
    () => payload?.configs[activeCategory] ?? [],
    [activeCategory, payload],
  );

  useEffect(() => {
    let isMounted = true;

    fetchConfig()
      .then((nextPayload) => {
        if (isMounted) {
          setPayload(nextPayload);
          setErrorMessage(null);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setErrorMessage(getErrorMessage(error, "Không đọc được config."));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCreate = async () => {
    const promise = mutateConfig("POST", {
      category: activeCategory,
      value: createDraft.value,
      label: createDraft.label,
      order: toOptionalNumber(createDraft.order),
      isActive: createDraft.isActive,
    });

    toast.promise(promise, {
      loading: "Đang tạo config...",
      success: "Đã tạo config.",
      error: (error) => getErrorMessage(error, "Không tạo được config."),
    });

    const nextPayload = await promise;

    setPayload(nextPayload);
    setCreateDraft(emptyDraft);
    setErrorMessage(null);
  };

  const handleStartEdit = (item: TaskConfigItem) => {
    setEditingId(item.id);
    setEditDraft({
      value: item.value,
      label: item.label,
      order: String(item.order),
      isActive: item.isActive,
    });
  };

  const handleUpdate = async (item: TaskConfigItem) => {
    setBusyId(item.id);

    const promise = mutateConfig("PATCH", {
      id: item.id,
      updates: {
        value: editDraft.value,
        label: editDraft.label,
        order: toOptionalNumber(editDraft.order) ?? item.order,
        isActive: editDraft.isActive,
      },
    });

    toast.promise(promise, {
      loading: "Đang cập nhật config...",
      success: "Đã cập nhật config.",
      error: (error) => getErrorMessage(error, "Không cập nhật được config."),
    });

    try {
      const nextPayload = await promise;

      setPayload(nextPayload);
      setEditingId(null);
      setEditDraft(emptyDraft);
      setErrorMessage(null);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item: TaskConfigItem) => {
    setBusyId(item.id);

    const promise = mutateConfig("DELETE", {
      id: item.id,
    });

    toast.promise(promise, {
      loading: "Đang xóa config...",
      success: "Đã xóa config.",
      error: (error) => getErrorMessage(error, "Không xóa được config."),
    });

    try {
      const nextPayload = await promise;

      setPayload(nextPayload);
      setErrorMessage(null);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-[90] bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-config-title"
        onClick={(event) => event.stopPropagation()}
        className="ml-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-[#f9f4ec] shadow-2xl shadow-slate-950/25 sm:max-h-[calc(100vh-3rem)]"
      >
        <div className="border-b border-slate-200 bg-white/75 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">
                App Config
              </p>
              <h2
                id="task-config-title"
                className="mt-3 text-2xl font-black tracking-[-0.05em] text-slate-950"
              >
                Status, Priority, System, Tags
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                Lưu vào tab App Config trên Google Sheet backend.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-teal-200 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200"
            >
              Đóng
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-5">
          <div className="grid gap-2 sm:grid-cols-4">
            {CONFIG_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  setActiveCategory(category.id);
                  setEditingId(null);
                }}
                className={cn(
                  "rounded-2xl border px-4 py-3 text-sm font-black transition",
                  activeCategory === category.id
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-white bg-white/75 text-slate-600 hover:border-teal-200 hover:text-teal-800",
                )}
              >
                {category.label}
                <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs">
                  {payload?.configs[category.id]?.length ?? 0}
                </span>
              </button>
            ))}
          </div>

          {errorMessage ? (
            <div className="mt-4 rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">
              {errorMessage}
            </div>
          ) : null}

          <div className="mt-5 rounded-[1.5rem] border border-teal-100 bg-teal-50/70 p-4">
            <p className="text-sm font-black text-teal-950">
              Thêm {getCategoryLabel(activeCategory)}
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_7rem_auto_auto] md:items-end">
              <ConfigInput
                label="Value"
                value={createDraft.value}
                onChange={(value) =>
                  setCreateDraft((draft) => ({ ...draft, value }))
                }
              />
              <ConfigInput
                label="Label"
                value={createDraft.label}
                onChange={(label) =>
                  setCreateDraft((draft) => ({ ...draft, label }))
                }
              />
              <ConfigInput
                label="Order"
                inputMode="numeric"
                value={createDraft.order}
                onChange={(order) =>
                  setCreateDraft((draft) => ({ ...draft, order }))
                }
              />
              <ConfigCheckbox
                checked={createDraft.isActive}
                label="Active"
                onChange={(isActive) =>
                  setCreateDraft((draft) => ({ ...draft, isActive }))
                }
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={!createDraft.value.trim()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-teal-700 px-5 text-sm font-black text-white shadow-lg shadow-teal-900/15 transition hover:-translate-y-0.5 hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <AppIcon name="plus" className="size-4" />
                Thêm
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="mt-5 rounded-[1.5rem] border border-dashed border-slate-300 bg-white/60 p-8 text-center">
              <AppIcon
                name="loader"
                className="mx-auto size-6 animate-spin text-teal-700"
              />
              <p className="mt-3 text-sm font-bold text-slate-500">
                Đang đọc App Config...
              </p>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3">
            {activeItems.map((item) => {
              const isEditing = editingId === item.id;
              const isBusy = busyId === item.id;

              return (
                <article
                  key={item.id}
                  className="rounded-[1.5rem] border border-white/80 bg-white/80 p-4 shadow-sm shadow-slate-900/5"
                >
                  {isEditing ? (
                    <div className="grid gap-3 md:grid-cols-[1fr_1fr_7rem_auto_auto_auto] md:items-end">
                      <ConfigInput
                        label="Value"
                        value={editDraft.value}
                        onChange={(value) =>
                          setEditDraft((draft) => ({ ...draft, value }))
                        }
                      />
                      <ConfigInput
                        label="Label"
                        value={editDraft.label}
                        onChange={(label) =>
                          setEditDraft((draft) => ({ ...draft, label }))
                        }
                      />
                      <ConfigInput
                        label="Order"
                        inputMode="numeric"
                        value={editDraft.order}
                        onChange={(order) =>
                          setEditDraft((draft) => ({ ...draft, order }))
                        }
                      />
                      <ConfigCheckbox
                        checked={editDraft.isActive}
                        label="Active"
                        onChange={(isActive) =>
                          setEditDraft((draft) => ({ ...draft, isActive }))
                        }
                      />
                      <button
                        type="button"
                        onClick={() => handleUpdate(item)}
                        disabled={isBusy || !editDraft.value.trim()}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-teal-900 disabled:cursor-wait disabled:opacity-60"
                      >
                        <AppIcon
                          name={isBusy ? "loader" : "save"}
                          className={cn("size-4", isBusy && "animate-spin")}
                        />
                        Lưu
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        disabled={isBusy}
                        className="h-10 rounded-full border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 transition hover:border-slate-300 disabled:cursor-wait disabled:opacity-60"
                      >
                        Hủy
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-3 py-1 text-xs font-black",
                              item.isActive
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 text-slate-500",
                            )}
                          >
                            {item.isActive ? "Active" : "Inactive"}
                          </span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                            Order {item.order}
                          </span>
                        </div>
                        <h3 className="mt-3 text-lg font-black text-slate-950">
                          {item.label}
                        </h3>
                        <p className="mt-1 text-sm font-semibold text-slate-500">
                          {item.value}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(item)}
                          disabled={isBusy}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-teal-200 hover:text-teal-800 disabled:cursor-wait disabled:opacity-60"
                        >
                          <AppIcon name="pencil" className="size-4" />
                          Sửa
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          disabled={isBusy}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-rose-100 bg-rose-50 px-4 text-sm font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-wait disabled:opacity-60"
                        >
                          <AppIcon
                            name={isBusy ? "loader" : "trash"}
                            className={cn("size-4", isBusy && "animate-spin")}
                          />
                          Xóa
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}

            {!isLoading && !activeItems.length ? (
              <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white/60 p-8 text-center">
                <p className="text-lg font-black text-slate-800">
                  Chưa có config trong nhóm này
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function ConfigInput({
  inputMode,
  label,
  value,
  onChange,
}: {
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
        className="h-11 rounded-2xl border border-white bg-white px-4 text-sm font-bold normal-case tracking-normal text-slate-800 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
      />
    </label>
  );
}

function ConfigCheckbox({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-11 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-teal-700"
      />
      {label}
    </label>
  );
}

async function fetchConfig() {
  const response = await fetch(TASK_CONFIG_API_URL, { cache: "no-store" });

  return readConfigResponse(response, "Không đọc được config.");
}

async function mutateConfig(method: "POST" | "PATCH" | "DELETE", body: unknown) {
  const response = await fetch(TASK_CONFIG_API_URL, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return readConfigResponse(response, "Không thao tác được config.");
}

async function readConfigResponse(response: Response, fallbackMessage: string) {
  const text = await response.text();
  let payload: unknown = {};

  if (text.trim()) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw Object.assign(
        new Error(
          `${fallbackMessage} Server trả response không phải JSON (${response.status} ${response.statusText}).`,
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
    throwConfigError(payload, fallbackMessage);
  }

  return payload as TaskConfigsPayload;
}

function throwConfigError(payload: unknown, fallbackMessage: string): never {
  const message =
    isRecord(payload) &&
    isRecord(payload.error) &&
    typeof payload.error.message === "string"
      ? payload.error.message
      : fallbackMessage;

  throw Object.assign(new Error(message), { payload });
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error ? error.message : fallbackMessage;
}

function getCategoryLabel(category: TaskConfigCategory) {
  return (
    CONFIG_CATEGORIES.find((item) => item.id === category)?.label ?? category
  );
}

function toOptionalNumber(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
