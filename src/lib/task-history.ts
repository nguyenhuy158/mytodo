import "server-only";

import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  TaskHistoryAction,
  TaskHistoryChange,
  TaskHistoryCreateInput,
  TaskHistoryEntry,
  TaskHistoryMetadataValue,
  TaskHistoryTarget,
} from "@/lib/tasks";

const DEFAULT_HISTORY_DIR = ".task-history";
const HISTORY_FILENAME = "history.jsonl";
const DEFAULT_HISTORY_LIMIT = 100;
const MAX_HISTORY_LIMIT = 500;

export class TaskHistoryStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskHistoryStorageError";
  }
}

export async function appendTaskHistoryEntry(
  input: TaskHistoryCreateInput,
): Promise<TaskHistoryEntry> {
  const historyDir = getHistoryDir();
  const entry: TaskHistoryEntry = {
    id: randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    actorEmail: input.actorEmail,
    action: input.action,
    summary: input.summary,
    target: input.target,
    changes: input.changes,
    metadata: input.metadata,
  };

  await mkdir(historyDir, { recursive: true });
  await appendFile(
    getHistoryFilePath(),
    `${JSON.stringify(entry)}\n`,
    "utf8",
  );

  return entry;
}

export async function listTaskHistoryEntries(options?: {
  limit?: number;
}): Promise<TaskHistoryEntry[]> {
  const limit = normalizeLimit(options?.limit);

  await mkdir(getHistoryDir(), { recursive: true });

  let content = "";

  try {
    content = await readFile(getHistoryFilePath(), "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw new TaskHistoryStorageError("Không đọc được history log.");
  }

  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseHistoryLine)
    .filter((entry): entry is TaskHistoryEntry => Boolean(entry))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

function parseHistoryLine(line: string) {
  try {
    const parsed = JSON.parse(line) as unknown;

    return isTaskHistoryEntry(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isTaskHistoryEntry(value: unknown): value is TaskHistoryEntry {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.actorEmail === "string" &&
    isTaskHistoryAction(value.action) &&
    typeof value.summary === "string" &&
    isTaskHistoryTarget(value.target) &&
    Array.isArray(value.changes) &&
    value.changes.every(isTaskHistoryChange) &&
    (value.metadata === undefined || isHistoryMetadata(value.metadata))
  );
}

function isTaskHistoryAction(value: unknown): value is TaskHistoryAction {
  return (
    value === "task.create" ||
    value === "task.update" ||
    value === "backup.create" ||
    value === "backup.restore"
  );
}

function isTaskHistoryTarget(value: unknown): value is TaskHistoryTarget {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.type === "task" ||
      value.type === "backup" ||
      value.type === "sheet") &&
    (value.rowNumber === undefined || typeof value.rowNumber === "number") &&
    (value.taskId === undefined || typeof value.taskId === "string") &&
    (value.taskTitle === undefined || typeof value.taskTitle === "string") &&
    (value.backupId === undefined || typeof value.backupId === "string")
  );
}

function isTaskHistoryChange(value: unknown): value is TaskHistoryChange {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.field === "string" &&
    typeof value.label === "string" &&
    typeof value.before === "string" &&
    typeof value.after === "string"
  );
}

function isHistoryMetadata(
  value: unknown,
): value is Record<string, TaskHistoryMetadataValue> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(
    (item) =>
      item === null ||
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean",
  );
}

function normalizeLimit(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return DEFAULT_HISTORY_LIMIT;
  }

  const normalizedLimit = value ?? DEFAULT_HISTORY_LIMIT;

  return Math.min(Math.max(Math.trunc(normalizedLimit), 1), MAX_HISTORY_LIMIT);
}

function getHistoryDir() {
  return path.join(process.cwd(), DEFAULT_HISTORY_DIR);
}

function getHistoryFilePath() {
  return path.join(getHistoryDir(), HISTORY_FILENAME);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
