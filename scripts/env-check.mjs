import fs from "node:fs";

const ENV_FILE = ".env.local";

function parseEnvFile(path) {
  const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
  const env = {};

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = stripEnvQuotes(line.slice(separatorIndex + 1).trim());

    env[key] = value;
  }

  return env;
}

function stripEnvQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assertServiceAccountJsonBase64(value) {
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    const credentials = JSON.parse(decoded);

    if (
      typeof credentials.client_email !== "string" ||
      typeof credentials.private_key !== "string"
    ) {
      fail(
        "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 must decode to a service-account JSON with client_email and private_key.",
      );
    }
  } catch {
    fail("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 must be valid base64 JSON.");
  }
}

if (!fs.existsSync(ENV_FILE)) {
  fail("Missing .env.local. Create it from .env.example.");
}

const env = parseEnvFile(ENV_FILE);
const required = [
  "GOOGLE_SHEET_ID",
  "GOOGLE_SHEET_GID",
  "NEXT_PUBLIC_TASK_POLLING_MS",
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_ALLOWED_EMAILS",
];
const missing = required.filter((key) => !env[key]);

if (missing.length) {
  fail(`Missing env: ${missing.join(", ")}`);
}

const serviceAccountJsonBase64 = (
  env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 || ""
).trim();
const credentialsPath = (env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
const hasCredentialFile = Boolean(
  credentialsPath && fs.existsSync(credentialsPath),
);
const hasServiceAccountPair = Boolean(
  (env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim() &&
    (env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").trim(),
);

if (serviceAccountJsonBase64) {
  assertServiceAccountJsonBase64(serviceAccountJsonBase64);
} else if (credentialsPath && !hasCredentialFile) {
  fail("GOOGLE_APPLICATION_CREDENTIALS file not found.");
} else if (!hasCredentialFile && !hasServiceAccountPair) {
  fail(
    "Missing Google Sheet auth: set GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, GOOGLE_APPLICATION_CREDENTIALS, or GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.",
  );
}

const allowedEmails = (env.AUTH_ALLOWED_EMAILS || "")
  .split(/[\s,;]+/)
  .filter(Boolean);

if (!allowedEmails.length || allowedEmails.some((email) => !email.includes("@"))) {
  fail("AUTH_ALLOWED_EMAILS must contain one or more email addresses.");
}

const magicKeys = [
  "MAGIC_LINK_SMTP_HOST",
  "MAGIC_LINK_SMTP_USER",
  "MAGIC_LINK_SMTP_PASS",
];
const hasMagic = magicKeys.some((key) => (env[key] || "").trim());
const missingMagic = hasMagic
  ? magicKeys.filter((key) => !(env[key] || "").trim())
  : [];

if (missingMagic.length) {
  fail(`Missing magic link SMTP env: ${missingMagic.join(", ")}`);
}

const magicPort = env.MAGIC_LINK_SMTP_PORT;

if (magicPort && (!Number.isFinite(Number(magicPort)) || Number(magicPort) <= 0)) {
  fail("MAGIC_LINK_SMTP_PORT must be a positive number.");
}

if (env.APP_BASE_URL) {
  try {
    new URL(env.APP_BASE_URL);
  } catch {
    fail("APP_BASE_URL must be a valid URL.");
  }
}

console.log("env ok");
