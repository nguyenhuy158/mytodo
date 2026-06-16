export type TaskStatus =
  | "In Progress"
  | "Not Started"
  | "Done"
  | "Blocked"
  | "Unknown";

export type TaskPriority = "High" | "Medium" | "Low" | "Unknown";

export type TaskCacheStatus = "hit" | "miss" | "refresh";

export type TaskUpdateInput = {
  rowNumber: number;
  updates: {
    status?: TaskStatus;
    priority?: TaskPriority;
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
