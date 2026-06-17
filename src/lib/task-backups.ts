import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  TaskBackupRecord,
  TaskBackupSnapshot,
  TaskBackupSummary,
} from "@/lib/tasks";

const BACKUP_FILE_EXTENSION = ".json";
const DEFAULT_BACKUP_DIR = ".task-backups";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class TaskBackupStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskBackupStorageError";
  }
}

export async function saveTaskBackup(
  snapshot: TaskBackupSnapshot,
  note?: string,
): Promise<TaskBackupSummary> {
  const backupDir = getBackupDir();
  const id = randomUUID();
  const record: TaskBackupRecord = {
    ...snapshot,
    id,
    note: note?.trim() || undefined,
  };
  const filePath = path.join(
    backupDir,
    `${toFileTimestamp(record.createdAt)}-${id}${BACKUP_FILE_EXTENSION}`,
  );

  await mkdir(backupDir, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

  return toTaskBackupSummary(record);
}

export async function listTaskBackups(): Promise<TaskBackupSummary[]> {
  const records = await readTaskBackupRecords();

  return records
    .map(toTaskBackupSummary)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function readTaskBackup(id: string): Promise<TaskBackupRecord> {
  if (!UUID_PATTERN.test(id)) {
    throw new TaskBackupStorageError("Backup id không hợp lệ.");
  }

  const records = await readTaskBackupRecords();
  const record = records.find((backup) => backup.id === id);

  if (!record) {
    throw new TaskBackupStorageError("Không tìm thấy backup để restore.");
  }

  return record;
}

function getBackupDir() {
  return path.join(process.cwd(), DEFAULT_BACKUP_DIR);
}

async function readTaskBackupRecords() {
  const backupDir = getBackupDir();

  await mkdir(backupDir, { recursive: true });

  const filenames = await readdir(backupDir);
  const records = await Promise.all(
    filenames
      .filter((filename) => filename.endsWith(BACKUP_FILE_EXTENSION))
      .map((filename) => readBackupFile(path.join(backupDir, filename))),
  );

  return records.filter((record): record is TaskBackupRecord => Boolean(record));
}

async function readBackupFile(filePath: string) {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;

    return isTaskBackupRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isTaskBackupRecord(value: unknown): value is TaskBackupRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.version === 1 &&
    typeof value.id === "string" &&
    typeof value.createdAt === "string" &&
    (value.source === "google-sheet" || value.source === "xlsx") &&
    typeof value.spreadsheetId === "string" &&
    typeof value.sheetTitle === "string" &&
    typeof value.range === "string" &&
    typeof value.rowCount === "number" &&
    typeof value.columnCount === "number" &&
    typeof value.taskCount === "number" &&
    Array.isArray(value.rows) &&
    value.rows.every(isStringArray)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function toTaskBackupSummary(
  record: TaskBackupRecord,
): TaskBackupSummary {
  return {
    id: record.id,
    version: record.version,
    createdAt: record.createdAt,
    source: record.source,
    spreadsheetId: record.spreadsheetId,
    sheetTitle: record.sheetTitle,
    range: record.range,
    rowCount: record.rowCount,
    columnCount: record.columnCount,
    taskCount: record.taskCount,
    note: record.note,
  };
}

function toFileTimestamp(value: string) {
  return value.replaceAll(":", "-").replaceAll(".", "-");
}
