export type TaskStatus =
  | "In Progress"
  | "Not Started"
  | "Done"
  | "Blocked"
  | "Unknown";

export type TaskPriority = "High" | "Medium" | "Low" | "Unknown";

export type TaskCacheStatus = "hit" | "miss" | "refresh";
export type TaskBackupSource = "google-sheet" | "xlsx";

export type TaskUpdateInput = {
  rowNumber: number;
  updates: {
    tags?: string;
    system?: string;
    task?: string;
    details?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    timeline?: string;
    dateReceived?: string;
    deadline?: string;
    actualDate?: string;
    note?: string;
  };
};

export type TaskCreateInput = {
  tags?: string;
  system?: string;
  task: string;
  details?: string;
  priority: TaskPriority;
  status: TaskStatus;
  timeline?: string;
  dateReceived?: string;
  deadline?: string;
  actualDate?: string;
  note?: string;
};

export type TaskCacheMeta = {
  status: TaskCacheStatus;
  cachedAt: string;
  expiresAt: string;
  ttlMs: number;
  ageMs: number;
};

export type SheetTask = {
  id: string;
  rowNumber: number;
  tags: string;
  system: string;
  task: string;
  details: string;
  priority: TaskPriority;
  status: TaskStatus;
  timeline: string;
  timelineDays: number | null;
  dateReceived: string;
  deadline: string;
  actualDate: string;
  note: string;
  startDateISO: string | null;
  deadlineISO: string | null;
  actualDateISO: string | null;
  daysLeft: number | null;
  isOverdue: boolean;
};

export type TasksPayload = {
  tasks: SheetTask[];
  meta: {
    updatedAt: string;
    sheetTitle: string;
    range: string;
    spreadsheetId: string;
    pollingMs: number;
    cache: TaskCacheMeta;
  };
};

export type TaskBackupSnapshot = {
  version: 1;
  createdAt: string;
  source: TaskBackupSource;
  spreadsheetId: string;
  sheetTitle: string;
  range: string;
  rowCount: number;
  columnCount: number;
  taskCount: number;
  rows: string[][];
};

export type TaskBackupSummary = Omit<TaskBackupSnapshot, "rows"> & {
  id: string;
  note?: string;
};

export type TaskBackupRecord = TaskBackupSummary & {
  rows: string[][];
};

export type TaskBackupsPayload = {
  backups: TaskBackupSummary[];
};

export type TaskBackupMutationPayload = TaskBackupsPayload & {
  backup: TaskBackupSummary;
  safetyBackup?: TaskBackupSummary;
  tasksPayload?: TasksPayload;
};

export type TaskHistoryAction =
  | "task.create"
  | "task.update"
  | "backup.create"
  | "backup.restore";

export type TaskHistoryTargetType = "task" | "backup" | "sheet";

export type TaskHistoryMetadataValue = string | number | boolean | null;

export type TaskHistoryChange = {
  field: string;
  label: string;
  before: string;
  after: string;
};

export type TaskHistoryTarget = {
  type: TaskHistoryTargetType;
  rowNumber?: number;
  taskId?: string;
  taskTitle?: string;
  backupId?: string;
};

export type TaskHistoryEntry = {
  id: string;
  createdAt: string;
  actorEmail: string;
  action: TaskHistoryAction;
  summary: string;
  target: TaskHistoryTarget;
  changes: TaskHistoryChange[];
  metadata?: Record<string, TaskHistoryMetadataValue>;
};

export type TaskHistoryCreateInput = Omit<
  TaskHistoryEntry,
  "id" | "createdAt"
> & {
  createdAt?: string;
};

export type TaskHistoryPayload = {
  entries: TaskHistoryEntry[];
  meta: {
    limit: number;
    total: number;
  };
};

export function normalizeStatus(value: string): TaskStatus {
  const normalized = value.trim().toLowerCase();

  if (normalized === "in progress" || normalized === "doing") {
    return "In Progress";
  }

  if (normalized === "not started" || normalized === "todo") {
    return "Not Started";
  }

  if (normalized === "done" || normalized === "completed") {
    return "Done";
  }

  if (normalized === "blocked" || normalized === "stuck") {
    return "Blocked";
  }

  return "Unknown";
}

export function normalizePriority(value: string): TaskPriority {
  const normalized = value.trim().toLowerCase();

  if (normalized === "high") {
    return "High";
  }

  if (normalized === "medium") {
    return "Medium";
  }

  if (normalized === "low") {
    return "Low";
  }

  return "Unknown";
}

export function parseSheetDate(value: string): string | null {
  const raw = value.trim();

  if (!raw) {
    return null;
  }

  const dateOnly = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);

  if (dateOnly) {
    const [, dayText, monthText, yearText] = dateOnly;
    const day = Number(dayText);
    const month = Number(monthText);
    const normalizedYear = Number(yearText);
    const year = normalizedYear < 100 ? 2000 + normalizedYear : normalizedYear;

    if (isValidDatePart(year, month, day)) {
      return toISODate(year, month, day);
    }
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

export function parseTimelineDays(value: string): number | null {
  const raw = value.trim().replace(",", ".");

  if (!raw) {
    return null;
  }

  const match = raw.match(/^(\d+(?:\.\d+)?)/);

  if (!match) {
    return null;
  }

  const days = Number(match[1]);

  return Number.isFinite(days) && days >= 0 ? days : null;
}

export function daysBetween(startISO: string, endISO: string) {
  const start = Date.parse(`${startISO}T00:00:00Z`);
  const end = Date.parse(`${endISO}T00:00:00Z`);

  return Math.round((end - start) / 86_400_000);
}

function isValidDatePart(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function toISODate(year: number, month: number, day: number) {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}
