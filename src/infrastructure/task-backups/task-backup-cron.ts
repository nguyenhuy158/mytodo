import "server-only";
import {
  createTaskBackupApplicationService,
  createTaskHistoryApplicationService,
} from "@/infrastructure/app-services";
import type { TaskBackupSummary } from "@/lib/tasks";

const CRON_ACTOR_EMAIL = "system@cron";
const DEFAULT_BACKUP_INTERVAL_HOURS = 12;
const DEFAULT_CHECK_INTERVAL_MS = 60_000;
const DEFAULT_RETRY_INTERVAL_MS = 15 * 60_000;
const STARTUP_DELAY_MS = 30_000;

type BackupCronState = {
  initialTimer?: ReturnType<typeof setTimeout>;
  intervalTimer?: ReturnType<typeof setInterval>;
  isRunning: boolean;
  nextRetryAt: number;
  started: boolean;
};

const globalBackupCron = globalThis as typeof globalThis & {
  __mytodoBackupCron?: BackupCronState;
};

export function startTaskBackupCron() {
  const state = getBackupCronState();

  if (state.started) {
    return;
  }

  if (!isBackupCronEnabled()) {
    console.info("[task-backup-cron] disabled");
    state.started = true;

    return;
  }

  const intervalMs = getBackupCronIntervalMs();
  const checkIntervalMs = Math.min(intervalMs, DEFAULT_CHECK_INTERVAL_MS);

  state.started = true;
  state.initialTimer = setTimeout(() => {
    void runBackupCronIfDue("startup", intervalMs, state);
  }, STARTUP_DELAY_MS);
  state.intervalTimer = setInterval(() => {
    void runBackupCronIfDue("interval", intervalMs, state);
  }, checkIntervalMs);
  state.initialTimer.unref?.();
  state.intervalTimer.unref?.();

  console.info(
    `[task-backup-cron] started: interval=${formatDuration(intervalMs)}, check=${formatDuration(checkIntervalMs)}`,
  );
}

async function runBackupCronIfDue(
  trigger: "interval" | "startup",
  intervalMs: number,
  state: BackupCronState,
) {
  const now = Date.now();

  if (state.isRunning || now < state.nextRetryAt) {
    return;
  }

  state.isRunning = true;

  try {
    const backupService = createTaskBackupApplicationService();
    const backups = await backupService.listBackups();
    const latestBackup = backups[0];

    if (!isBackupDue(latestBackup, intervalMs, now)) {
      return;
    }

    const mutationPayload = await backupService.createBackup(
      `Auto backup by cron every ${formatDuration(intervalMs)}`,
    );

    await recordCronBackupHistory({
      backup: mutationPayload.backup,
      intervalMs,
      trigger,
    });

    console.info(
      `[task-backup-cron] created backup ${mutationPayload.backup.id} (${mutationPayload.backup.taskCount} task)`,
    );
  } catch (error) {
    state.nextRetryAt = Date.now() + getBackupCronRetryMs();
    console.error("[task-backup-cron] backup failed", error);
  } finally {
    state.isRunning = false;
  }
}

async function recordCronBackupHistory({
  backup,
  intervalMs,
  trigger,
}: {
  backup: TaskBackupSummary;
  intervalMs: number;
  trigger: string;
}) {
  try {
    await createTaskHistoryApplicationService().recordBackupCreate({
      actorEmail: CRON_ACTOR_EMAIL,
      backup,
      requestContext: {
        intervalMs,
        source: "cron",
        trigger,
      },
    });
  } catch (error) {
    console.error("[task-backup-cron] history write failed", error);
  }
}

function getBackupCronState() {
  globalBackupCron.__mytodoBackupCron ??= {
    isRunning: false,
    nextRetryAt: 0,
    started: false,
  };

  return globalBackupCron.__mytodoBackupCron;
}

function isBackupDue(
  latestBackup: TaskBackupSummary | undefined,
  intervalMs: number,
  now: number,
) {
  if (!latestBackup) {
    return true;
  }

  const latestBackupTime = Date.parse(latestBackup.createdAt);

  if (!Number.isFinite(latestBackupTime)) {
    return true;
  }

  return now - latestBackupTime >= intervalMs;
}

function isBackupCronEnabled() {
  const rawValue = process.env.TASK_BACKUP_CRON_ENABLED?.trim().toLowerCase();

  if (!rawValue) {
    return process.env.NODE_ENV === "production";
  }

  return !["0", "false", "no", "off"].includes(rawValue);
}

function getBackupCronIntervalMs() {
  const configuredMs = toPositiveInteger(process.env.TASK_BACKUP_CRON_INTERVAL_MS);

  if (configuredMs) {
    return configuredMs;
  }

  const configuredHours = toPositiveNumber(
    process.env.TASK_BACKUP_CRON_INTERVAL_HOURS,
  );
  const intervalHours = configuredHours ?? DEFAULT_BACKUP_INTERVAL_HOURS;

  return Math.max(60_000, Math.round(intervalHours * 60 * 60 * 1000));
}

function getBackupCronRetryMs() {
  return (
    toPositiveInteger(process.env.TASK_BACKUP_CRON_RETRY_MS) ??
    DEFAULT_RETRY_INTERVAL_MS
  );
}

function toPositiveInteger(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function toPositiveNumber(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatDuration(valueMs: number) {
  const hours = valueMs / (60 * 60 * 1000);

  if (Number.isInteger(hours)) {
    return `${hours}h`;
  }

  const minutes = valueMs / 60_000;

  return Number.isInteger(minutes) ? `${minutes}m` : `${valueMs}ms`;
}
