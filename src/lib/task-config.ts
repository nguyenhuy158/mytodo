import "server-only";

import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import type {
  TaskConfigCategory,
  TaskConfigCreateInput,
  TaskConfigDeleteInput,
  TaskConfigItem,
  TaskConfigUpdateInput,
} from "@/lib/tasks";

const DEFAULT_SPREADSHEET_ID = "1Sv86oc9zXbvwSsD956uT4opSU8JqP04s";
const DEFAULT_CONFIG_SHEET_TITLE = "App Config";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const GOOGLE_SHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";

const CONFIG_HEADERS = [
  "ID",
  "Category",
  "Value",
  "Label",
  "Order",
  "Active",
  "Created At",
  "Updated At",
  "Updated By",
] as const;

const CONFIG_CATEGORIES: TaskConfigCategory[] = [
  "status",
  "priority",
  "system",
  "tags",
];

const DEFAULT_CONFIG_ITEMS: Array<{
  category: TaskConfigCategory;
  value: string;
  label: string;
  order: number;
}> = [
  { category: "status", value: "Not Started", label: "Not Started", order: 10 },
  { category: "status", value: "In Progress", label: "In Progress", order: 20 },
  { category: "status", value: "Blocked", label: "Blocked", order: 30 },
  { category: "status", value: "Done", label: "Done", order: 40 },
  { category: "status", value: "Unknown", label: "Unknown", order: 90 },
  { category: "priority", value: "High", label: "High", order: 10 },
  { category: "priority", value: "Medium", label: "Medium", order: 20 },
  { category: "priority", value: "Low", label: "Low", order: 30 },
  { category: "priority", value: "Unknown", label: "Unknown", order: 90 },
];

type ConfigRuntimeConfig = {
  spreadsheetId: string;
  sheetTitle: string;
};

type ConfigSheetContext = ConfigRuntimeConfig & {
  sheetId: number;
  sheets: ReturnType<typeof google.sheets>;
};

type ConfigRow = {
  item: TaskConfigItem;
  rowNumber: number;
};

export class TaskConfigStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskConfigStorageError";
  }
}

export async function listTaskConfigItems(): Promise<TaskConfigItem[]> {
  const context = await getConfigSheetContext();

  return readConfigRows(context).then((rows) => rows.map((row) => row.item));
}

export async function createTaskConfigItem(
  input: TaskConfigCreateInput,
): Promise<TaskConfigItem> {
  const context = await getConfigSheetContext();
  const rows = await readConfigRows(context);
  const createdAt = new Date().toISOString();
  const item: TaskConfigItem = {
    id: randomUUID(),
    category: input.category,
    value: normalizeValue(input.value),
    label: normalizeOptionalLabel(input.label, input.value),
    order: input.order ?? getNextOrder(rows, input.category),
    isActive: input.isActive ?? true,
    createdAt,
    updatedAt: createdAt,
    updatedBy: input.actorEmail,
  };

  assertValidCategory(item.category);
  assertUniqueConfigValue(rows, item.category, item.value);

  await context.sheets.spreadsheets.values.append({
    spreadsheetId: context.spreadsheetId,
    range: `${quoteSheetName(context.sheetTitle)}!A:I`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [toConfigRow(item)],
    },
  });

  return item;
}

export async function updateTaskConfigItem(
  input: TaskConfigUpdateInput,
): Promise<TaskConfigItem> {
  const context = await getConfigSheetContext();
  const rows = await readConfigRows(context);
  const currentRow = findConfigRow(rows, input.id);
  const nextItem: TaskConfigItem = {
    ...currentRow.item,
    value:
      input.updates.value === undefined
        ? currentRow.item.value
        : normalizeValue(input.updates.value),
    label:
      input.updates.label === undefined
        ? currentRow.item.label
        : normalizeOptionalLabel(input.updates.label, currentRow.item.value),
    order: input.updates.order ?? currentRow.item.order,
    isActive: input.updates.isActive ?? currentRow.item.isActive,
    updatedAt: new Date().toISOString(),
    updatedBy: input.actorEmail,
  };

  assertUniqueConfigValue(rows, nextItem.category, nextItem.value, nextItem.id);

  await context.sheets.spreadsheets.values.update({
    spreadsheetId: context.spreadsheetId,
    range: `${quoteSheetName(context.sheetTitle)}!A${currentRow.rowNumber}:I${currentRow.rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [toConfigRow(nextItem)],
    },
  });

  return nextItem;
}

export async function deleteTaskConfigItem(
  input: TaskConfigDeleteInput,
): Promise<TaskConfigItem> {
  const context = await getConfigSheetContext();
  const rows = await readConfigRows(context);
  const currentRow = findConfigRow(rows, input.id);

  await context.sheets.spreadsheets.batchUpdate({
    spreadsheetId: context.spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: context.sheetId,
              dimension: "ROWS",
              startIndex: currentRow.rowNumber - 1,
              endIndex: currentRow.rowNumber,
            },
          },
        },
      ],
    },
  });

  return {
    ...currentRow.item,
    updatedAt: new Date().toISOString(),
    updatedBy: input.actorEmail,
  };
}

async function getConfigSheetContext(): Promise<ConfigSheetContext> {
  const config = getRuntimeConfig();
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
    fileId: config.spreadsheetId,
    fields: "mimeType,name",
  });

  if (metadata.data.mimeType !== GOOGLE_SHEET_MIME_TYPE) {
    throw new TaskConfigStorageError(
      "Config sheet chỉ hỗ trợ Google Sheet native.",
    );
  }

  const sheetId = await ensureConfigSheet(sheets, config);

  return {
    ...config,
    sheetId,
    sheets,
  };
}

async function ensureConfigSheet(
  sheets: ReturnType<typeof google.sheets>,
  config: ConfigRuntimeConfig,
) {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: config.spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  const existingSheet = spreadsheet.data.sheets?.find(
    (sheet) => sheet.properties?.title === config.sheetTitle,
  );

  if (typeof existingSheet?.properties?.sheetId === "number") {
    await ensureConfigHeader(sheets, config);
    await seedDefaultConfigItemsIfEmpty(
      sheets,
      config,
      existingSheet.properties.sheetId,
    );

    return existingSheet.properties.sheetId;
  }

  const response = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: config.spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: config.sheetTitle,
            },
          },
        },
      ],
    },
  });
  const sheetId =
    response.data.replies?.[0]?.addSheet?.properties?.sheetId ?? null;

  if (sheetId === null) {
    throw new TaskConfigStorageError("Không tạo được App Config sheet.");
  }

  await ensureConfigHeader(sheets, config);
  await seedDefaultConfigItems(sheets, config);

  return sheetId;
}

async function ensureConfigHeader(
  sheets: ReturnType<typeof google.sheets>,
  config: ConfigRuntimeConfig,
) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${quoteSheetName(config.sheetTitle)}!A1:I1`,
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE",
  });
  const currentHeader = response.data.values?.[0] ?? [];
  const isHeaderReady = CONFIG_HEADERS.every(
    (header, index) => currentHeader[index] === header,
  );

  if (isHeaderReady) {
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range: `${quoteSheetName(config.sheetTitle)}!A1:I1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [Array.from(CONFIG_HEADERS)],
    },
  });
}

async function seedDefaultConfigItemsIfEmpty(
  sheets: ReturnType<typeof google.sheets>,
  config: ConfigRuntimeConfig,
  sheetId: number,
) {
  const rowCount = await getConfigDataRowCount(sheets, config);

  if (rowCount > 0) {
    return;
  }

  if (sheetId < 0) {
    return;
  }

  await seedDefaultConfigItems(sheets, config);
}

async function seedDefaultConfigItems(
  sheets: ReturnType<typeof google.sheets>,
  config: ConfigRuntimeConfig,
) {
  const now = new Date().toISOString();
  const values = DEFAULT_CONFIG_ITEMS.map((item) =>
    toConfigRow({
      id: randomUUID(),
      category: item.category,
      value: item.value,
      label: item.label,
      order: item.order,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      updatedBy: "system",
    }),
  );

  if (!values.length) {
    return;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range: `${quoteSheetName(config.sheetTitle)}!A:I`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values,
    },
  });
}

async function getConfigDataRowCount(
  sheets: ReturnType<typeof google.sheets>,
  config: ConfigRuntimeConfig,
) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${quoteSheetName(config.sheetTitle)}!A2:I`,
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE",
  });

  return response.data.values?.filter((row) => row.some(Boolean)).length ?? 0;
}

async function readConfigRows(context: ConfigSheetContext) {
  const response = await context.sheets.spreadsheets.values.get({
    spreadsheetId: context.spreadsheetId,
    range: `${quoteSheetName(context.sheetTitle)}!A2:I`,
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  return (response.data.values ?? [])
    .map((row, index) => parseConfigRow(row, index + 2))
    .filter((row): row is ConfigRow => Boolean(row));
}

function parseConfigRow(row: unknown[], rowNumber: number): ConfigRow | null {
  const item: TaskConfigItem = {
    id: getCell(row, 0),
    category: getCell(row, 1) as TaskConfigCategory,
    value: getCell(row, 2),
    label: getCell(row, 3),
    order: Number(getCell(row, 4)) || rowNumber,
    isActive: getCell(row, 5).toLowerCase() !== "false",
    createdAt: getCell(row, 6),
    updatedAt: getCell(row, 7),
    updatedBy: getCell(row, 8),
  };

  if (!item.id || !CONFIG_CATEGORIES.includes(item.category) || !item.value) {
    return null;
  }

  return {
    item,
    rowNumber,
  };
}

function toConfigRow(item: TaskConfigItem) {
  return [
    item.id,
    item.category,
    item.value,
    item.label,
    item.order,
    item.isActive ? "TRUE" : "FALSE",
    item.createdAt,
    item.updatedAt,
    item.updatedBy,
  ];
}

function findConfigRow(rows: ConfigRow[], id: string) {
  const row = rows.find((item) => item.item.id === id);

  if (!row) {
    throw new TaskConfigStorageError("Không tìm thấy config item.");
  }

  return row;
}

function assertValidCategory(category: TaskConfigCategory) {
  if (!CONFIG_CATEGORIES.includes(category)) {
    throw new TaskConfigStorageError("Config category không hợp lệ.");
  }
}

function assertUniqueConfigValue(
  rows: ConfigRow[],
  category: TaskConfigCategory,
  value: string,
  ignoredId?: string,
) {
  const normalizedValue = value.trim().toLowerCase();
  const duplicated = rows.some(
    (row) =>
      row.item.id !== ignoredId &&
      row.item.category === category &&
      row.item.value.trim().toLowerCase() === normalizedValue,
  );

  if (duplicated) {
    throw new TaskConfigStorageError("Config value đã tồn tại trong category này.");
  }
}

function getNextOrder(rows: ConfigRow[], category: TaskConfigCategory) {
  const maxOrder = rows
    .filter((row) => row.item.category === category)
    .reduce((max, row) => Math.max(max, row.item.order), 0);

  return maxOrder + 10;
}

function normalizeValue(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new TaskConfigStorageError("Config value không được để trống.");
  }

  return normalized;
}

function normalizeOptionalLabel(label: string | undefined, fallback: string) {
  return label?.trim() || fallback.trim();
}

function getRuntimeConfig(): ConfigRuntimeConfig {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const sheetTitle = process.env.TASK_CONFIG_SHEET_TITLE?.trim();

  return {
    spreadsheetId: spreadsheetId || DEFAULT_SPREADSHEET_ID,
    sheetTitle: sheetTitle || DEFAULT_CONFIG_SHEET_TITLE,
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
    throw new TaskConfigStorageError(
      "Thiếu Google service-account env để ghi App Config.",
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
    throw new TaskConfigStorageError(
      `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 không hợp lệ: ${
        error instanceof Error ? error.message : "không decode được JSON"
      }.`,
    );
  }
}

function getCell(row: unknown[], index: number) {
  return String(row[index] ?? "").trim();
}

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, "\n");
}

function quoteSheetName(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}
