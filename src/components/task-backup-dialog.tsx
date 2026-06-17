"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import type {
  TaskBackupMutationPayload,
  TaskBackupsPayload,
  TaskBackupSummary,
} from "@/lib/tasks";
import { AppIcon } from "@/components/app-icon";
import { cn } from "@/lib/utils";

const TASKS_API_URL = "/api/tasks";
const TASK_BACKUPS_API_URL = "/api/task-backups";
const RESTORE_CONFIRMATION = "RESTORE";

type BackupFetchError = Error & {
  payload?: {
    error?: {
      message?: string;
    };
  };
};

export function TaskBackupDialog({ onClose }: { onClose: () => void }) {
  const [backups, setBackups] = useState<TaskBackupSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [restoringBackupId, setRestoringBackupId] = useState<string | null>(null);
  const [confirmBackupId, setConfirmBackupId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isBusy = isCreating || restoringBackupId !== null;

  useEffect(() => {
    let isMounted = true;

    fetchBackups()
      .then((payload) => {
        if (isMounted) {
          setBackups(payload.backups);
          setErrorMessage(null);
        }
      })
      .catch((error: BackupFetchError) => {
        if (isMounted) {
          setErrorMessage(error.message);
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

  const handleClose = () => {
    if (!isBusy) {
      onClose();
    }
  };

  const handleCreateBackup = async () => {
    const createBackup = async () => {
      setIsCreating(true);

      try {
        const payload = await postBackupAction({
          action: "create",
        });

        setBackups(payload.backups);
        setErrorMessage(null);

        return payload;
      } finally {
        setIsCreating(false);
      }
    };

    const createPromise = createBackup();

    toast.promise(createPromise, {
      loading: "Đang backup dữ liệu Sheet...",
      success: (payload) =>
        `Đã backup ${payload.backup.rowCount} dòng, ${payload.backup.taskCount} task.`,
      error: (error) =>
        error instanceof Error ? error.message : "Không tạo được backup.",
    });

    await createPromise;
  };

  const handleOpenRestoreConfirm = (backupId: string) => {
    setConfirmBackupId(backupId);
    setConfirmation("");
  };

  const handleRestoreBackup = async (backup: TaskBackupSummary) => {
    const restoreBackup = async () => {
      setRestoringBackupId(backup.id);

      try {
        const payload = await postBackupAction({
          action: "restore",
          backupId: backup.id,
          confirmation,
        });

        setBackups(payload.backups);
        setConfirmBackupId(null);
        setConfirmation("");
        setErrorMessage(null);

        if (payload.tasksPayload) {
          await mutate(TASKS_API_URL, payload.tasksPayload, {
            revalidate: false,
          });
        }

        return payload;
      } finally {
        setRestoringBackupId(null);
      }
    };

    const restorePromise = restoreBackup();

    toast.promise(restorePromise, {
      loading: `Đang restore backup ${shortBackupId(backup.id)}...`,
      success: (payload) =>
        payload.safetyBackup
          ? `Đã restore. Safety backup: ${shortBackupId(payload.safetyBackup.id)}.`
          : "Đã restore dữ liệu.",
      error: (error) =>
        error instanceof Error ? error.message : "Không restore được backup.",
    });

    await restorePromise;
  };

  return (
    <div
      role="presentation"
      onClick={handleClose}
      className="fixed inset-0 z-[90] bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-backup-title"
        onClick={(event) => event.stopPropagation()}
        className="ml-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-[#f9f4ec] shadow-2xl shadow-slate-950/25 sm:max-h-[calc(100vh-3rem)]"
      >
        <div className="border-b border-slate-200 bg-white/75 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">
                Sheet rollback
              </p>
              <h2
                id="task-backup-title"
                className="mt-3 text-2xl font-black tracking-[-0.05em] text-slate-950"
              >
                Backup / Restore dữ liệu
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                Restore sẽ ghi đè dữ liệu hiện tại bằng snapshot đã chọn.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={isBusy}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-teal-200 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 disabled:cursor-wait disabled:opacity-60"
            >
              Đóng
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-5">
          <div className="flex flex-col gap-3 rounded-[1.5rem] border border-teal-100 bg-teal-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black text-teal-950">
                Tạo backup từ dữ liệu Sheet hiện tại
              </p>
              <p className="mt-1 text-sm font-semibold leading-6 text-teal-900/70">
                File backup lưu local trên server, không commit lên git.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCreateBackup}
              disabled={isBusy}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-teal-700 px-5 text-sm font-black text-white shadow-lg shadow-teal-900/15 transition hover:-translate-y-0.5 hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 disabled:cursor-wait disabled:opacity-70"
            >
              {isCreating ? (
                <AppIcon name="loader" className="size-4 animate-spin" />
              ) : (
                <AppIcon name="databaseBackup" className="size-4" />
              )}
              Backup now
            </button>
          </div>

          {errorMessage ? (
            <div className="mt-4 rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">
              {errorMessage}
            </div>
          ) : null}

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                Backup history
              </h3>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500">
                {backups.length}
              </span>
            </div>

            {isLoading ? (
              <div className="mt-4 rounded-[1.5rem] border border-dashed border-slate-300 bg-white/60 p-8 text-center">
                <AppIcon
                  name="loader"
                  className="mx-auto size-6 animate-spin text-teal-700"
                />
                <p className="mt-3 text-sm font-bold text-slate-500">
                  Đang đọc backup...
                </p>
              </div>
            ) : null}

            {!isLoading && !backups.length ? (
              <div className="mt-4 rounded-[1.5rem] border border-dashed border-slate-300 bg-white/60 p-8 text-center">
                <p className="text-lg font-black text-slate-800">
                  Chưa có backup nào
                </p>
              </div>
            ) : null}

            <div className="mt-4 grid gap-3">
              {backups.map((backup) => {
                const isConfirming = confirmBackupId === backup.id;
                const isRestoring = restoringBackupId === backup.id;
                const canRestore =
                  isConfirming &&
                  confirmation.trim().toUpperCase() === RESTORE_CONFIRMATION;

                return (
                  <article
                    key={backup.id}
                    className="rounded-[1.5rem] border border-white/80 bg-white/80 p-4 shadow-sm shadow-slate-900/5"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                            {formatBackupSource(backup.source)}
                          </span>
                          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">
                            {backup.taskCount} task
                          </span>
                          <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-black text-teal-800">
                            {backup.rowCount} dòng
                          </span>
                        </div>
                        <h4 className="mt-3 text-base font-black text-slate-950">
                          {formatBackupDate(backup.createdAt)}
                        </h4>
                        <p className="mt-1 text-sm font-semibold text-slate-500">
                          {backup.sheetTitle} · {backup.range} ·{" "}
                          {shortBackupId(backup.id)}
                        </p>
                        {backup.note ? (
                          <p className="mt-2 rounded-2xl bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600">
                            {backup.note}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenRestoreConfirm(backup.id)}
                        disabled={isBusy}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100 disabled:cursor-wait disabled:opacity-60"
                      >
                        <AppIcon name="restore" className="size-4" />
                        Restore
                      </button>
                    </div>

                    {isConfirming ? (
                      <div className="mt-4 rounded-[1.25rem] border border-rose-100 bg-rose-50/80 p-3">
                        <p className="text-sm font-bold leading-6 text-rose-950">
                          Server sẽ tạo safety backup trước rồi restore snapshot
                          này lên Sheet hiện tại.
                        </p>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <input
                            value={confirmation}
                            onChange={(event) =>
                              setConfirmation(event.target.value)
                            }
                            disabled={isBusy}
                            placeholder="Nhập RESTORE"
                            className="h-11 min-w-0 flex-1 rounded-2xl border border-white bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100 disabled:cursor-wait disabled:opacity-60"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmBackupId(null);
                              setConfirmation("");
                            }}
                            disabled={isBusy}
                            className="rounded-full border border-white bg-white px-4 py-2 text-sm font-black text-slate-600 transition hover:border-slate-300 disabled:cursor-wait disabled:opacity-60"
                          >
                            Hủy
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreBackup(backup)}
                            disabled={!canRestore || isBusy}
                            className={cn(
                              "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-black text-white transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-50",
                              canRestore
                                ? "bg-rose-700 hover:bg-rose-900"
                                : "bg-slate-400",
                            )}
                          >
                            {isRestoring ? (
                              <AppIcon
                                name="loader"
                                className="size-4 animate-spin"
                              />
                            ) : (
                              <AppIcon name="restore" className="size-4" />
                            )}
                            Xác nhận restore
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

async function fetchBackups(): Promise<TaskBackupsPayload> {
  const response = await fetch(TASK_BACKUPS_API_URL, { cache: "no-store" });
  const payload = await response.json();

  if (!response.ok) {
    throwBackupError(payload, "Không đọc được backup.");
  }

  return payload as TaskBackupsPayload;
}

async function postBackupAction(
  body: Record<string, string>,
): Promise<TaskBackupMutationPayload> {
  const response = await fetch(TASK_BACKUPS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();

  if (!response.ok) {
    throwBackupError(payload, "Không thao tác được backup.");
  }

  return payload as TaskBackupMutationPayload;
}

function throwBackupError(payload: unknown, fallbackMessage: string): never {
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

function shortBackupId(id: string) {
  return id.slice(0, 8);
}

function formatBackupSource(source: TaskBackupSummary["source"]) {
  return source === "google-sheet" ? "Google Sheet" : "XLSX";
}

function formatBackupDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
