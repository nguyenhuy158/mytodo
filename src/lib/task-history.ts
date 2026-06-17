import "server-only";

import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import type {
  TaskHistoryAction,
  TaskHistoryChange,
  TaskHistoryCreateInput,
  TaskHistoryEntry,
  TaskHistoryMetadataValue,
  TaskHistoryTarget,
} from "@/lib/tasks";

const DEFAULT_SPREADSHEET_ID = "1Sv86oc9zXbvwSsD956uT4opSU8JqP04s";
const DEFAULT_HISTORY_SHEET_TITLE = "Activity Log";
const DEFAULT_HISTORY_LIMIT = 100;
const MAX_HISTORY_LIMIT = 500;
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const GOOGLE_SHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";

const HISTORY_HEADERS = [
  "ID",
  "Created At",
  "Actor Email",
  "Action",
  "Summary",
  "Target Type",
  "Row Number",
  "Task ID",
  "Task Title",
  "Backup ID",
  "Changes JSON",
  "Metadata JSON",
] as const;

type HistoryRuntimeConfig = {
  spreadsheetId: string;
  sheetTitle: string;
};

export class TaskHistoryStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskHistoryStorageError";
  }
}

export async function appendTaskHistoryEntry(
  input: TaskHistoryCreateInput,
): Promise<TaskHistoryEntry> {
  const config = getRuntimeConfig();
  const sheets = await getNativeSheetClient(config.spreadsheetId);
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

  await ensureHistorySheet(sheets, config);
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range: `${quoteSheetName(config.sheetTitle)}!A:L`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [toHistoryRow(entry)],
    },
  });

  return entry;
}

export async function listTaskHistoryEntries(options?: {
  limit?: number;
}): Promise<TaskHistoryEntry[]> {
  const limit = normalizeLimit(options?.limit);
  const config = getRuntimeConfig();
  const sheets = await getNativeSheetClient(config.spreadsheetId);

  await ensureHistorySheet(sheets, config);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${quoteSheetName(config.sheetTitle)}!A2:L`,
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  return (response.data.values ?? [])
    .map(parseHistoryRow)
    .filter((entry): entry is TaskHistoryEntry => Boolean(entry))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

async function getNativeSheetClient(spreadsheetId: string) {
  const auth = getAuthClient();
  const drive = google.drive({
    version: "v3",
    auth,
  });
  const metadata = await drive.files.get({
    fileId: spreadsheetId,
    fields: "mimeType,name",
  });

  if (metadata.data.mimeType !== GOOGLE_SHEET_MIME_TYPE) {
    throw new TaskHistoryStorageError(
      "Activity log chỉ tự tạo hidden tab khi nguồn dữ liệu là Google Sheet native.",
    );
  }

  return google.sheets({
    version: "v4",
    auth,
  });
}

async function ensureHistorySheet(
  sheets: ReturnType<typeof google.sheets>,
  config: HistoryRuntimeConfig,
) {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: config.spreadsheetId,
    fields: "sheets.properties(sheetId,title,hidden)",
  });
  const existingSheet = spreadsheet.data.sheets?.find(
    (sheet) => sheet.properties?.title === config.sheetTitle,
  );

  if (existingSheet?.properties?.sheetId !== undefined) {
    if (!existingSheet.properties.hidden) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: config.spreadsheetId,
        requestBody: {
          requests: [
            {
              updateSheetProperties: {
                properties: {
                  sheetId: existingSheet.properties.sheetId,
                  hidden: true,
                },
                fields: "hidden",
              },
            },
          ],
        },
      });
    }

    await ensureHistoryHeader(sheets, config);

    return;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: config.spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: config.sheetTitle,
              hidden: true,
            },
          },
        },
      ],
    },
  });
  await ensureHistoryHeader(sheets, config);
}

async function ensureHistoryHeader(
  sheets: ReturnType<typeof google.sheets>,
  config: HistoryRuntimeConfig,
) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${quoteSheetName(config.sheetTitle)}!A1:L1`,
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE",
  });
  const currentHeader = response.data.values?.[0] ?? [];
  const isHeaderReady = HISTORY_HEADERS.every(
    (header, index) => currentHeader[index] === header,
  );

  if (isHeaderReady) {
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range: `${quoteSheetName(config.sheetTitle)}!A1:L1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [Array.from(HISTORY_HEADERS)],
    },
  });
}

function toHistoryRow(entry: TaskHistoryEntry) {
  return [
    entry.id,
    entry.createdAt,
    entry.actorEmail,
    entry.action,
    entry.summary,
    entry.target.type,
    entry.target.rowNumber?.toString() ?? "",
    entry.target.taskId ?? "",
    entry.target.taskTitle ?? "",
    entry.target.backupId ?? "",
    JSON.stringify(entry.changes),
    entry.metadata ? JSON.stringify(entry.metadata) : "",
  ];
}

function parseHistoryRow(row: unknown[]) {
  const entry: TaskHistoryEntry = {
    id: getCell(row, 0),
    createdAt: getCell(row, 1),
    actorEmail: getCell(row, 2),
    action: getCell(row, 3) as TaskHistoryAction,
    summary: getCell(row, 4),
    target: {
      type: getCell(row, 5) as TaskHistoryTarget["type"],
      rowNumber: parseRowNumber(getCell(row, 6)),
      taskId: optionalCell(row, 7),
      taskTitle: optionalCell(row, 8),
      backupId: optionalCell(row, 9),
    },
    changes: parseJson(getCell(row, 10), []),
    metadata: parseMetadata(getCell(row, 11)),
  };

  return isTaskHistoryEntry(entry) ? entry : null;
}

function parseMetadata(
  value: string,
): Record<string, TaskHistoryMetadataValue> | undefined {
  if (!value.trim()) {
    return undefined;
  }

  return parseJson<Record<string, TaskHistoryMetadataValue> | undefined>(
    value,
    undefined,
  );
}

function parseJson<T>(value: string, fallback: T) {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
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

  return Object.values(value).every(isHistoryMetadataValue);
}

function isHistoryMetadataValue(
  value: unknown,
): value is TaskHistoryMetadataValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isHistoryMetadataValue);
  }

  if (isRecord(value)) {
    return Object.values(value).every(isHistoryMetadataValue);
  }

  return false;
}

function normalizeLimit(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return DEFAULT_HISTORY_LIMIT;
  }

  const normalizedLimit = value ?? DEFAULT_HISTORY_LIMIT;

  return Math.min(Math.max(Math.trunc(normalizedLimit), 1), MAX_HISTORY_LIMIT);
}

function getRuntimeConfig(): HistoryRuntimeConfig {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const sheetTitle = process.env.TASK_HISTORY_SHEET_TITLE?.trim();

  return {
    spreadsheetId: spreadsheetId || DEFAULT_SPREADSHEET_ID,
    sheetTitle: sheetTitle || DEFAULT_HISTORY_SHEET_TITLE,
  };
}

function getAuthClient() {
  const serviceAccountJsonBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (serviceAccountJsonBase64) {
    const credentials = parseServiceAccountJsonBase64(serviceAccountJsonBase64);

    return new google.auth.JWT({
      email: credentials.email,
      key: normalizePrivateKey(credentials.privateKey),
      scopes: [SHEETS_SCOPE, DRIVE_SCOPE],
    });
  }

  if (credentialsPath) {
    return new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: [SHEETS_SCOPE, DRIVE_SCOPE],
    });
  }

  if (!email || !privateKey) {
    throw new TaskHistoryStorageError(
      "Thiếu Google service-account env để ghi Activity Log.",
    );
  }

  return new google.auth.JWT({
    email,
    key: normalizePrivateKey(privateKey),
    scopes: [SHEETS_SCOPE, DRIVE_SCOPE],
  });
}

function parseServiceAccountJsonBase64(value: string) {
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    const credentials = JSON.parse(decoded) as {
      client_email?: unknown;
      private_key?: unknown;
    };

    if (
      typeof credentials.client_email !== "string" ||
      typeof credentials.private_key !== "string"
    ) {
      throw new Error("missing client_email or private_key");
    }

    return {
      email: credentials.client_email,
      privateKey: credentials.private_key,
    };
  } catch (error) {
    throw new TaskHistoryStorageError(
      `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 không hợp lệ: ${
        error instanceof Error ? error.message : "không decode được JSON"
      }.`,
    );
  }
}

function parseRowNumber(value: string) {
  const rowNumber = Number(value);

  return Number.isInteger(rowNumber) && rowNumber > 0 ? rowNumber : undefined;
}

function getCell(row: unknown[], index: number) {
  return String(row[index] ?? "").trim();
}

function optionalCell(row: unknown[], index: number) {
  const value = getCell(row, index);

  return value || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, "\n");
}

function quoteSheetName(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}
