import "server-only";

import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { google } from "googleapis";
import {
  daysBetween,
  normalizePriority,
  normalizeStatus,
  parseSheetDate,
  parseTimelineDays,
  type TaskBackupRecord,
  type TaskBackupSnapshot,
  type TaskBackupSource,
  type SheetTask,
  type TaskCacheStatus,
  type TaskCreateInput,
  type TaskUpdateInput,
  type TasksPayload,
} from "@/lib/tasks";

const DEFAULT_SPREADSHEET_ID = "1Sv86oc9zXbvwSsD956uT4opSU8JqP04s";
const DEFAULT_SHEET_GID = "689856921";
const DEFAULT_POLLING_MS = 15_000;
const DEFAULT_CACHE_TTL_MS = 60_000;
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const GOOGLE_SHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";
const XLSX_FILE_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLSX_MIME_TYPES = new Set([
  XLSX_FILE_MIME_TYPE,
  "application/vnd.ms-excel",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
]);

type HeaderKey =
  | "tags"
  | "system"
  | "task"
  | "details"
  | "priority"
  | "status"
  | "timeline"
  | "dateReceived"
  | "deadline"
  | "actualDate"
  | "note";

const HEADER_ALIASES: Record<HeaderKey, string[]> = {
  tags: ["tags", "tag"],
  system: ["system"],
  task: ["task", "tasks"],
  details: ["details", "detail"],
  priority: ["priority", "priori"],
  status: ["status"],
  timeline: ["timeline", "time line", "duration", "duration days"],
  dateReceived: ["date rec", "date received", "received date"],
  deadline: ["deadline", "due date"],
  actualDate: ["actual da", "actual date", "actual"],
  note: ["note", "notes"],
};

type WritableHeaderKey = "priority" | "status" | "actualDate" | "note";
type CreatableHeaderKey =
  | "tags"
  | "system"
  | "task"
  | "details"
  | "priority"
  | "status"
  | "timeline"
  | "dateReceived"
  | "deadline"
  | "actualDate"
  | "note";

const WRITABLE_UPDATE_FIELDS: WritableHeaderKey[] = [
  "priority",
  "status",
  "actualDate",
  "note",
];

const WRITABLE_HEADER_LABELS: Record<WritableHeaderKey, string> = {
  priority: "PRIORITY",
  status: "STATUS",
  actualDate: "Actual Da",
  note: "Note",
};

type SheetRuntimeConfig = {
  spreadsheetId: string;
  pollingMs: number;
  cacheTtlMs: number;
  cacheKey: string;
};

type SheetCacheEntry = {
  payload: TasksPayload;
  cachedAtMs: number;
  expiresAtMs: number;
  ttlMs: number;
  cacheKey: string;
};

type GetSheetTasksOptions = {
  forceRefresh?: boolean;
};

type SheetRowsSnapshot = {
  source: TaskBackupSource;
  spreadsheetId: string;
  sheetTitle: string;
  range: string;
  rows: string[][];
};

let sheetTaskCache: SheetCacheEntry | null = null;
let inFlightCacheRefresh: Promise<SheetCacheEntry> | null = null;

export class SheetConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetConfigError";
  }
}

export async function getSheetTasks(
  options: GetSheetTasksOptions = {},
): Promise<TasksPayload> {
  const config = getRuntimeConfig();
  const now = Date.now();

  if (!options.forceRefresh && isCacheFresh(sheetTaskCache, config.cacheKey, now)) {
    return withCacheMeta(sheetTaskCache, "hit", now);
  }

  const entry = await refreshSheetTaskCache(config);

  return withCacheMeta(
    entry,
    options.forceRefresh ? "refresh" : "miss",
    Date.now(),
  );
}

export async function updateSheetTask(input: TaskUpdateInput): Promise<void> {
  if (!Number.isInteger(input.rowNumber) || input.rowNumber < 1) {
    throw new SheetConfigError("Row number không hợp lệ.");
  }

  const { spreadsheetId } = getRuntimeConfig();
  const auth = getAuthClient();
  const drive = google.drive({
    version: "v3",
    auth,
  });
  const sheets = google.sheets({
    version: "v4",
    auth,
  });
  const metadata = await drive.files.get({
    fileId: spreadsheetId,
    fields: "mimeType,name",
  });

  if (metadata.data.mimeType === GOOGLE_SHEET_MIME_TYPE) {
    await updateNativeSheetTask(sheets, spreadsheetId, input);
    clearSheetTaskCache();

    return;
  }

  if (metadata.data.mimeType && XLSX_MIME_TYPES.has(metadata.data.mimeType)) {
    await updateXlsxTask(drive, spreadsheetId, input);
    clearSheetTaskCache();

    return;
  }

  throw new SheetConfigError(
    `File không phải Google Sheet hoặc XLSX. MIME type: ${metadata.data.mimeType ?? "unknown"}.`,
  );
}

export async function createSheetTask(input: TaskCreateInput): Promise<void> {
  if (!input.task.trim()) {
    throw new SheetConfigError("Task không được để trống.");
  }

  const { spreadsheetId } = getRuntimeConfig();
  const auth = getAuthClient();
  const drive = google.drive({
    version: "v3",
    auth,
  });
  const sheets = google.sheets({
    version: "v4",
    auth,
  });
  const metadata = await drive.files.get({
    fileId: spreadsheetId,
    fields: "mimeType,name",
  });

  if (metadata.data.mimeType === GOOGLE_SHEET_MIME_TYPE) {
    await appendNativeSheetTask(sheets, spreadsheetId, input);
    clearSheetTaskCache();

    return;
  }

  if (metadata.data.mimeType && XLSX_MIME_TYPES.has(metadata.data.mimeType)) {
    await appendXlsxTask(drive, spreadsheetId, input);
    clearSheetTaskCache();

    return;
  }

  throw new SheetConfigError(
    `File không phải Google Sheet hoặc XLSX. MIME type: ${metadata.data.mimeType ?? "unknown"}.`,
  );
}

export async function createSheetBackupSnapshot(): Promise<TaskBackupSnapshot> {
  const snapshot = await readSheetRowsSnapshot(getRuntimeConfig());
  const tasks = parseRows(snapshot.rows);
  const createdAt = new Date().toISOString();

  return {
    version: 1,
    createdAt,
    source: snapshot.source,
    spreadsheetId: snapshot.spreadsheetId,
    sheetTitle: snapshot.sheetTitle,
    range: snapshot.range,
    rowCount: snapshot.rows.length,
    columnCount: getRowsColumnCount(snapshot.rows),
    taskCount: tasks.length,
    rows: snapshot.rows,
  };
}

export async function restoreSheetBackupSnapshot(
  backup: TaskBackupRecord,
): Promise<void> {
  if (backup.version !== 1) {
    throw new SheetConfigError("Backup version không được hỗ trợ.");
  }

  const { spreadsheetId } = getRuntimeConfig();

  if (backup.spreadsheetId !== spreadsheetId) {
    throw new SheetConfigError(
      "Backup không thuộc spreadsheet hiện tại. Không restore để tránh ghi nhầm file.",
    );
  }

  const auth = getAuthClient();
  const drive = google.drive({
    version: "v3",
    auth,
  });
  const sheets = google.sheets({
    version: "v4",
    auth,
  });
  const metadata = await drive.files.get({
    fileId: spreadsheetId,
    fields: "mimeType,name",
  });

  if (metadata.data.mimeType === GOOGLE_SHEET_MIME_TYPE) {
    if (backup.source !== "google-sheet") {
      throw new SheetConfigError(
        "Backup này là XLSX, nhưng nguồn hiện tại là Google Sheet.",
      );
    }

    await restoreNativeSheetRows(sheets, spreadsheetId, backup);
    clearSheetTaskCache();

    return;
  }

  if (metadata.data.mimeType && XLSX_MIME_TYPES.has(metadata.data.mimeType)) {
    if (backup.source !== "xlsx") {
      throw new SheetConfigError(
        "Backup này là Google Sheet, nhưng nguồn hiện tại là XLSX.",
      );
    }

    await restoreXlsxRows(drive, spreadsheetId, backup);
    clearSheetTaskCache();

    return;
  }

  throw new SheetConfigError(
    `File không phải Google Sheet hoặc XLSX. MIME type: ${metadata.data.mimeType ?? "unknown"}.`,
  );
}

function getRuntimeConfig(): SheetRuntimeConfig {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID ?? DEFAULT_SPREADSHEET_ID;
  const pollingMs = toPositiveNumber(
    process.env.NEXT_PUBLIC_TASK_POLLING_MS,
    DEFAULT_POLLING_MS,
  );
  const cacheTtlMs = toPositiveNumber(
    process.env.TASK_CACHE_TTL_MS,
    DEFAULT_CACHE_TTL_MS,
  );

  return {
    spreadsheetId,
    pollingMs,
    cacheTtlMs,
    cacheKey: [
      spreadsheetId,
      process.env.GOOGLE_SHEET_GID ?? DEFAULT_SHEET_GID,
      process.env.GOOGLE_SHEET_RANGE ?? "",
      process.env.GOOGLE_XLSX_SHEET_NAME ?? "",
    ].join(":"),
  };
}

async function refreshSheetTaskCache(
  config: SheetRuntimeConfig,
): Promise<SheetCacheEntry> {
  if (!inFlightCacheRefresh) {
    inFlightCacheRefresh = readSheetTasks(config)
      .then((payload) => {
        const cachedAtMs = Date.now();
        const entry = {
          payload,
          cachedAtMs,
          expiresAtMs: cachedAtMs + config.cacheTtlMs,
          ttlMs: config.cacheTtlMs,
          cacheKey: config.cacheKey,
        };

        sheetTaskCache = entry;

        return entry;
      })
      .finally(() => {
        inFlightCacheRefresh = null;
      });
  }

  return inFlightCacheRefresh;
}

async function readSheetTasks(config: SheetRuntimeConfig): Promise<TasksPayload> {
  const snapshot = await readSheetRowsSnapshot(config);

  return toPayload({
    rows: snapshot.rows,
    sheetTitle: snapshot.sheetTitle,
    range: snapshot.range,
    spreadsheetId: snapshot.spreadsheetId,
    pollingMs: config.pollingMs,
  });
}

async function readSheetRowsSnapshot(
  config: SheetRuntimeConfig,
): Promise<SheetRowsSnapshot> {
  const { spreadsheetId } = config;
  const auth = getAuthClient();
  const drive = google.drive({
    version: "v3",
    auth,
  });
  const sheets = google.sheets({
    version: "v4",
    auth,
  });
  const metadata = await drive.files.get({
    fileId: spreadsheetId,
    fields: "mimeType,name",
  });

  if (metadata.data.mimeType === GOOGLE_SHEET_MIME_TYPE) {
    const sheetTitle = await resolveSheetTitle(sheets, spreadsheetId);
    const range =
      process.env.GOOGLE_SHEET_RANGE ?? `${quoteSheetName(sheetTitle)}!A1:O`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      majorDimension: "ROWS",
      valueRenderOption: "FORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    });

    const rows = response.data.values ?? [];

    return {
      source: "google-sheet",
      rows,
      sheetTitle,
      range,
      spreadsheetId,
    };
  }

  if (metadata.data.mimeType && XLSX_MIME_TYPES.has(metadata.data.mimeType)) {
    const { rows, sheetTitle } = await readXlsxRowsFromDrive(drive, spreadsheetId);
    const range = `${quoteSheetName(sheetTitle)}!A1:O`;

    return {
      source: "xlsx",
      rows,
      sheetTitle,
      range,
      spreadsheetId,
    };
  }

  throw new SheetConfigError(
    `File không phải Google Sheet hoặc XLSX. MIME type: ${metadata.data.mimeType ?? "unknown"}.`,
  );
}

function isCacheFresh(
  entry: SheetCacheEntry | null,
  cacheKey: string,
  now: number,
): entry is SheetCacheEntry {
  return Boolean(entry && entry.cacheKey === cacheKey && entry.expiresAtMs > now);
}

function withCacheMeta(
  entry: SheetCacheEntry,
  status: TaskCacheStatus,
  now: number,
): TasksPayload {
  return {
    ...entry.payload,
    meta: {
      ...entry.payload.meta,
      cache: {
        status,
        cachedAt: new Date(entry.cachedAtMs).toISOString(),
        expiresAt: new Date(entry.expiresAtMs).toISOString(),
        ttlMs: entry.ttlMs,
        ageMs: Math.max(0, now - entry.cachedAtMs),
      },
    },
  };
}

function toPositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
    throw new SheetConfigError(
      "Thiếu GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, GOOGLE_APPLICATION_CREDENTIALS hoặc GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY trong .env.local.",
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
    throw new SheetConfigError(
      `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 không hợp lệ: ${
        error instanceof Error ? error.message : "không decode được JSON"
      }.`,
    );
  }
}

async function updateNativeSheetTask(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  input: TaskUpdateInput,
) {
  const sheetTitle = await resolveSheetTitle(sheets, spreadsheetId);
  const range =
    process.env.GOOGLE_SHEET_RANGE ?? `${quoteSheetName(sheetTitle)}!A1:O`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  const rows = response.data.values ?? [];
  const { headerIndexes } = getHeaderInfo(rows);
  const cellUpdates = buildTaskCellUpdates(headerIndexes, input);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: cellUpdates.map((update) => ({
        range: `${quoteSheetName(sheetTitle)}!${toColumnLetter(update.columnIndex)}${input.rowNumber}`,
        values: [[update.value]],
      })),
    },
  });
}

async function appendNativeSheetTask(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  input: TaskCreateInput,
) {
  const sheetTitle = await resolveSheetTitle(sheets, spreadsheetId);
  const range =
    process.env.GOOGLE_SHEET_RANGE ?? `${quoteSheetName(sheetTitle)}!A1:O`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  const rows = response.data.values ?? [];
  const { headerIndexes } = getHeaderInfo(rows);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [buildTaskCreateRow(headerIndexes, input)],
    },
  });
}

async function restoreNativeSheetRows(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  backup: TaskBackupRecord,
) {
  const sheetTitle = await resolveSheetTitle(sheets, spreadsheetId);
  const columnCount = Math.max(backup.columnCount, getRowsColumnCount(backup.rows), 1);
  const clearRange = `${quoteSheetName(sheetTitle)}!A:${toColumnLetter(columnCount - 1)}`;

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: clearRange,
  });

  if (!backup.rows.length) {
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoteSheetName(sheetTitle)}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: backup.rows,
    },
  });
}

async function updateXlsxTask(
  drive: ReturnType<typeof google.drive>,
  spreadsheetId: string,
  input: TaskUpdateInput,
) {
  const { workbook, worksheet } = await loadXlsxWorkbookFromDrive(
    drive,
    spreadsheetId,
  );
  const { headerIndexes } = getHeaderInfo(readRowsFromWorksheet(worksheet));
  const cellUpdates = buildTaskCellUpdates(headerIndexes, input);
  const row = worksheet.getRow(input.rowNumber);

  for (const update of cellUpdates) {
    row.getCell(update.columnIndex + 1).value = update.value;
  }

  row.commit();

  const content = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.isBuffer(content)
    ? content
    : Buffer.from(content as ArrayBuffer);

  await drive.files.update({
    fileId: spreadsheetId,
    requestBody: {
      mimeType: XLSX_FILE_MIME_TYPE,
    },
    media: {
      mimeType: XLSX_FILE_MIME_TYPE,
      body: Readable.from(buffer),
    },
  });
}

async function appendXlsxTask(
  drive: ReturnType<typeof google.drive>,
  spreadsheetId: string,
  input: TaskCreateInput,
) {
  const { workbook, worksheet } = await loadXlsxWorkbookFromDrive(
    drive,
    spreadsheetId,
  );
  const { headerIndexes } = getHeaderInfo(readRowsFromWorksheet(worksheet));
  const row = worksheet.addRow(buildTaskCreateRow(headerIndexes, input));

  row.commit();

  const content = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.isBuffer(content)
    ? content
    : Buffer.from(content as ArrayBuffer);

  await drive.files.update({
    fileId: spreadsheetId,
    requestBody: {
      mimeType: XLSX_FILE_MIME_TYPE,
    },
    media: {
      mimeType: XLSX_FILE_MIME_TYPE,
      body: Readable.from(buffer),
    },
  });
}

async function restoreXlsxRows(
  drive: ReturnType<typeof google.drive>,
  spreadsheetId: string,
  backup: TaskBackupRecord,
) {
  const { workbook, worksheet } = await loadXlsxWorkbookFromDrive(
    drive,
    spreadsheetId,
  );
  const rowCount = Math.max(worksheet.rowCount, backup.rowCount, backup.rows.length);
  const columnCount = Math.max(
    worksheet.columnCount,
    backup.columnCount,
    getRowsColumnCount(backup.rows),
    1,
  );

  for (let rowIndex = 1; rowIndex <= rowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);

    for (let columnIndex = 1; columnIndex <= columnCount; columnIndex += 1) {
      row.getCell(columnIndex).value = null;
    }

    row.commit();
  }

  backup.rows.forEach((values, rowIndex) => {
    const row = worksheet.getRow(rowIndex + 1);

    values.forEach((value, columnIndex) => {
      row.getCell(columnIndex + 1).value = value;
    });

    row.commit();
  });

  const content = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.isBuffer(content)
    ? content
    : Buffer.from(content as ArrayBuffer);

  await drive.files.update({
    fileId: spreadsheetId,
    requestBody: {
      mimeType: XLSX_FILE_MIME_TYPE,
    },
    media: {
      mimeType: XLSX_FILE_MIME_TYPE,
      body: Readable.from(buffer),
    },
  });
}

async function readXlsxRowsFromDrive(
  drive: ReturnType<typeof google.drive>,
  spreadsheetId: string,
) {
  const { worksheet, sheetTitle } = await loadXlsxWorkbookFromDrive(
    drive,
    spreadsheetId,
  );

  return {
    rows: readRowsFromWorksheet(worksheet),
    sheetTitle,
  };
}

async function loadXlsxWorkbookFromDrive(
  drive: ReturnType<typeof google.drive>,
  spreadsheetId: string,
) {
  const response = await drive.files.get(
    {
      fileId: spreadsheetId,
      alt: "media",
    },
    {
      responseType: "arraybuffer",
    },
  );
  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(toArrayBuffer(response.data));

  const requestedSheetName = process.env.GOOGLE_XLSX_SHEET_NAME;
  const worksheet =
    requestedSheetName && workbook.getWorksheet(requestedSheetName)
      ? workbook.getWorksheet(requestedSheetName)
      : workbook.worksheets[0];

  if (!worksheet) {
    throw new SheetConfigError("Workbook XLSX không có sheet nào để đọc.");
  }

  return {
    workbook,
    worksheet,
    sheetTitle: worksheet.name,
  };
}

function readRowsFromWorksheet(worksheet: ExcelJS.Worksheet) {
  const rows: string[][] = [];

  for (let rowIndex = 1; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    const values = Array.from({ length: worksheet.columnCount }, (_, index) =>
      formatExcelCell(row.getCell(index + 1)),
    );

    rows.push(values);
  }

  return rows;
}

function toArrayBuffer(value: unknown) {
  if (value instanceof ArrayBuffer) {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value.buffer.slice(
      value.byteOffset,
      value.byteOffset + value.byteLength,
    ) as ArrayBuffer;
  }

  if (typeof value === "string") {
    const buffer = Buffer.from(value);

    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
  }

  throw new SheetConfigError("Không đọc được nội dung XLSX từ Google Drive.");
}

function toPayload({
  rows,
  sheetTitle,
  range,
  spreadsheetId,
  pollingMs,
}: {
  rows: string[][];
  sheetTitle: string;
  range: string;
  spreadsheetId: string;
  pollingMs: number;
}): TasksPayload {
  const tasks = parseRows(rows);
  const updatedAt = new Date().toISOString();

  return {
    tasks,
    meta: {
      updatedAt,
      sheetTitle,
      range,
      spreadsheetId,
      pollingMs: Number.isFinite(pollingMs) ? pollingMs : DEFAULT_POLLING_MS,
      cache: {
        status: "miss",
        cachedAt: updatedAt,
        expiresAt: updatedAt,
        ttlMs: 0,
        ageMs: 0,
      },
    },
  };
}

function formatExcelCell(cell: ExcelJS.Cell) {
  const displayText = cell.text;

  if (
    typeof displayText === "string" &&
    displayText &&
    displayText !== "[object Object]"
  ) {
    return displayText.trim();
  }

  return formatExcelValue(cell.value).trim();
}

function getRowsColumnCount(rows: string[][]) {
  return rows.reduce((max, row) => Math.max(max, row.length), 0);
}

function formatExcelValue(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return formatISODateForDisplay(value.toISOString().slice(0, 10));
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((item) => item.text).join("");
  }

  if ("text" in value && typeof value.text === "string") {
    return value.text;
  }

  if ("result" in value) {
    return formatExcelValue(value.result as ExcelJS.CellValue);
  }

  return "";
}

function formatISODateForDisplay(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

async function resolveSheetTitle(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
) {
  const wantedGid = Number(process.env.GOOGLE_SHEET_GID ?? DEFAULT_SHEET_GID);
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });

  const sheet = spreadsheet.data.sheets?.find(
    (item) => item.properties?.sheetId === wantedGid,
  );

  if (!sheet?.properties?.title) {
    throw new SheetConfigError(
      `Không tìm thấy sheet gid=${wantedGid}. Kiểm tra GOOGLE_SHEET_GID hoặc quyền share cho service account.`,
    );
  }

  return sheet.properties.title;
}

function parseRows(rows: string[][]): SheetTask[] {
  const { headerRowIndex, headerIndexes } = getHeaderInfo(rows);
  const dataRows = rows.slice(headerRowIndex + 1);

  return dataRows
    .map((row, index) => toTask(row, headerIndexes, headerRowIndex + index + 2))
    .filter((task): task is SheetTask => Boolean(task));
}

function getHeaderInfo(rows: string[][]) {
  const headerRowIndex = rows.findIndex((row) => {
    const headers = row.map(normalizeHeader);

    return headers.includes("task") && headers.includes("deadline");
  });

  if (headerRowIndex === -1) {
    throw new SheetConfigError(
      "Không tìm thấy header TASK và Deadline trong sheet. Kiểm tra range hoặc tên cột.",
    );
  }

  const headerIndexes = buildHeaderIndexes(rows[headerRowIndex]);

  return {
    headerRowIndex,
    headerIndexes,
  };
}

function buildTaskCellUpdates(
  indexes: Record<HeaderKey, number>,
  input: TaskUpdateInput,
) {
  const updates = WRITABLE_UPDATE_FIELDS.flatMap((key) => {
    const nextValue = input.updates[key];

    if (nextValue === undefined) {
      return [];
    }

    const columnIndex = indexes[key];

    if (columnIndex < 0) {
      throw new SheetConfigError(
        `Không tìm thấy cột ${WRITABLE_HEADER_LABELS[key]} để cập nhật.`,
      );
    }

    return [
      {
        columnIndex,
        value: formatTaskUpdateValue(key, nextValue),
      },
    ];
  });

  if (!updates.length) {
    throw new SheetConfigError("Không có field hợp lệ để cập nhật.");
  }

  return updates;
}

function buildTaskCreateRow(
  indexes: Record<HeaderKey, number>,
  input: TaskCreateInput,
) {
  if (indexes.task < 0) {
    throw new SheetConfigError("Không tìm thấy cột TASK để tạo task.");
  }

  const rowLength = Math.max(1, ...Object.values(indexes).map((index) => index + 1));
  const row = Array.from({ length: rowLength }, () => "");
  const values = {
    tags: input.tags ?? "",
    system: input.system ?? "",
    task: input.task,
    details: input.details ?? "",
    priority: input.priority,
    status: input.status,
    timeline: input.timeline ?? "",
    dateReceived: input.dateReceived ?? "",
    deadline: input.deadline ?? "",
    actualDate: input.actualDate ?? "",
    note: input.note ?? "",
  } satisfies Record<CreatableHeaderKey, string>;

  for (const [key, value] of Object.entries(values) as Array<
    [CreatableHeaderKey, string]
  >) {
    const columnIndex = indexes[key];

    if (columnIndex >= 0) {
      row[columnIndex] = formatTaskCreateValue(key, value);
    }
  }

  return row;
}

function formatTaskUpdateValue(key: WritableHeaderKey, value: string) {
  const normalized = value.trim();

  if (key === "actualDate" && normalized) {
    return formatISODateForDisplay(normalized);
  }

  return normalized;
}

function formatTaskCreateValue(key: CreatableHeaderKey, value: string) {
  const normalized = value.trim();

  if (
    (key === "dateReceived" || key === "deadline" || key === "actualDate") &&
    normalized
  ) {
    return formatISODateForDisplay(normalized);
  }

  return normalized;
}

function toColumnLetter(index: number) {
  let columnNumber = index + 1;
  let columnName = "";

  while (columnNumber > 0) {
    const remainder = (columnNumber - 1) % 26;

    columnName = String.fromCharCode(65 + remainder) + columnName;
    columnNumber = Math.floor((columnNumber - remainder - 1) / 26);
  }

  return columnName;
}

function clearSheetTaskCache() {
  sheetTaskCache = null;
  inFlightCacheRefresh = null;
}

function buildHeaderIndexes(headers: string[]) {
  const normalizedHeaders = headers.map(normalizeHeader);

  return Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([key, aliases]) => [
      key,
      aliases
        .map((alias) => normalizedHeaders.indexOf(alias))
        .find((index) => index >= 0) ?? -1,
    ]),
  ) as Record<HeaderKey, number>;
}

function toTask(
  row: string[],
  indexes: Record<HeaderKey, number>,
  rowNumber: number,
) {
  const task = getCell(row, indexes.task);

  if (!task) {
    return null;
  }

  const dateReceived = getCell(row, indexes.dateReceived);
  const deadline = getCell(row, indexes.deadline);
  const actualDate = getCell(row, indexes.actualDate);
  const timeline = getCell(row, indexes.timeline);
  const startDateISO = parseSheetDate(dateReceived);
  const deadlineISO = parseSheetDate(deadline);
  const actualDateISO = parseSheetDate(actualDate);
  const todayISO = new Date().toISOString().slice(0, 10);
  const daysLeft = deadlineISO ? daysBetween(todayISO, deadlineISO) : null;
  const status = normalizeStatus(getCell(row, indexes.status));

  return {
    id: `row-${rowNumber}`,
    rowNumber,
    tags: getCell(row, indexes.tags),
    system: getCell(row, indexes.system),
    task,
    details: getCell(row, indexes.details),
    priority: normalizePriority(getCell(row, indexes.priority)),
    status,
    timeline,
    timelineDays: parseTimelineDays(timeline),
    dateReceived: startDateISO
      ? formatISODateForDisplay(startDateISO)
      : dateReceived,
    deadline: deadlineISO ? formatISODateForDisplay(deadlineISO) : deadline,
    actualDate: actualDateISO
      ? formatISODateForDisplay(actualDateISO)
      : actualDate,
    note: getCell(row, indexes.note),
    startDateISO,
    deadlineISO,
    actualDateISO,
    daysLeft,
    isOverdue: Boolean(
      deadlineISO && daysBetween(todayISO, deadlineISO) < 0 && status !== "Done",
    ),
  } satisfies SheetTask;
}

function getCell(row: string[], index: number) {
  if (index < 0) {
    return "";
  }

  return String(row[index] ?? "").trim();
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, "\n");
}

function quoteSheetName(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}
