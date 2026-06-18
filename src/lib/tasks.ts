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

export type SheetRuntimeInfoPayload = {
  sheet: {
    googleSheetUrl: string;
    range: string;
    sheetGid: string;
    spreadsheetId: string;
    xlsxSheetName: string;
  };
  meta: {
    updatedAt: string;
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
  | "backup.restore"
  | "config.create"
  | "config.update"
  | "config.delete";

export type TaskConfigCategory = "status" | "priority" | "system" | "tags";

export type TaskConfigItem = {
  id: string;
  category: TaskConfigCategory;
  value: string;
  label: string;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
};

export type TaskConfigCreateInput = {
  category: TaskConfigCategory;
  value: string;
  label?: string;
  order?: number;
  isActive?: boolean;
  actorEmail: string;
};

export type TaskConfigUpdateInput = {
  id: string;
  updates: {
    value?: string;
    label?: string;
    order?: number;
    isActive?: boolean;
  };
  actorEmail: string;
};

export type TaskConfigDeleteInput = {
  id: string;
  actorEmail: string;
};

export type TaskConfigsPayload = {
  configs: Record<TaskConfigCategory, TaskConfigItem[]>;
  meta: {
    updatedAt: string;
    sheetTitle: string;
    total: number;
  };
};

export type TaskHistoryTargetType = "task" | "backup" | "sheet" | "config";

export type TaskHistoryMetadataValue =
  | string
  | number
  | boolean
  | null
  | TaskHistoryMetadataValue[]
  | { [key: string]: TaskHistoryMetadataValue };

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
  configId?: string;
  configCategory?: TaskConfigCategory;
  configValue?: string;
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

export function formatTaskRowId(rowNumber: number) {
  return `R${rowNumber}`;
}

export function applyTaskUpdate(
  payload: TasksPayload | undefined,
  input: TaskUpdateInput,
): TasksPayload | undefined {
  if (!payload) {
    return payload;
  }

  const updatedAt = new Date().toISOString();
  const tasks = payload.tasks.map((task) =>
    task.rowNumber === input.rowNumber ? applyTaskUpdateToTask(task, input) : task,
  );

  return {
    ...payload,
    tasks,
    meta: {
      ...payload.meta,
      updatedAt,
    },
  };
}

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

function applyTaskUpdateToTask(
  task: SheetTask,
  input: TaskUpdateInput,
): SheetTask {
  const updates = input.updates;
  const startDateISO =
    updates.dateReceived === undefined
      ? task.startDateISO
      : parseSheetDate(updates.dateReceived);
  const deadlineISO =
    updates.deadline === undefined
      ? task.deadlineISO
      : parseSheetDate(updates.deadline);
  const actualDateISO =
    updates.actualDate === undefined
      ? task.actualDateISO
      : parseSheetDate(updates.actualDate);
  const status = updates.status ?? task.status;
  const timeline =
    updates.timeline === undefined ? task.timeline : updates.timeline.trim();
  const todayISO = new Date().toISOString().slice(0, 10);
  const daysLeft = deadlineISO ? daysBetween(todayISO, deadlineISO) : null;

  return {
    ...task,
    tags: updates.tags === undefined ? task.tags : updates.tags.trim(),
    system: updates.system === undefined ? task.system : updates.system.trim(),
    task: updates.task === undefined ? task.task : updates.task.trim(),
    details:
      updates.details === undefined ? task.details : updates.details.trim(),
    priority: updates.priority ?? task.priority,
    status,
    timeline,
    timelineDays: parseTimelineDays(timeline),
    dateReceived:
      updates.dateReceived === undefined
        ? task.dateReceived
        : formatTaskDateDisplay(startDateISO, updates.dateReceived),
    deadline:
      updates.deadline === undefined
        ? task.deadline
        : formatTaskDateDisplay(deadlineISO, updates.deadline),
    actualDate:
      updates.actualDate === undefined
        ? task.actualDate
        : formatTaskDateDisplay(actualDateISO, updates.actualDate),
    note: updates.note === undefined ? task.note : updates.note.trim(),
    startDateISO,
    deadlineISO,
    actualDateISO,
    daysLeft,
    isOverdue: Boolean(deadlineISO && daysLeft !== null && daysLeft < 0 && status !== "Done"),
  };
}

function formatTaskDateDisplay(valueISO: string | null, fallback: string) {
  return valueISO ? formatISODateForDisplay(valueISO) : fallback.trim();
}

function formatISODateForDisplay(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
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
