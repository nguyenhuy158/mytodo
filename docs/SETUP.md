# Setup

## Prerequisites

- Node.js compatible with Next.js `16.2.9`.
- Corepack enabled so `corepack pnpm` works.
- Google Cloud service account with Editor access to the target Sheet.
- A local service account JSON file for development, or service account env values for deployment.

## Install Dependencies

```bash
make install
```

Equivalent direct command:

```bash
corepack pnpm install
```

## Environment Variables

Create `.env.local` from `.env.example`.

Required for local development:

```txt
GOOGLE_SHEET_ID=1Sv86oc9zXbvwSsD956uT4opSU8JqP04s
GOOGLE_SHEET_GID=689856921
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
NEXT_PUBLIC_TASK_POLLING_MS=15000
TASK_CACHE_TTL_MS=60000
```

Optional:

```txt
GOOGLE_XLSX_SHEET_NAME=To-Do List
GOOGLE_SHEET_RANGE="'To-Do List'!A1:N"
```

For deployment providers that cannot read a local JSON file, use:

```txt
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"
```

Do not expose credentials in client code. Browser views only call `/api/tasks`.

## Google Cloud Setup

1. Create a Google Cloud service account.
2. Enable Google Sheets API.
3. Enable Google Drive API if the file is still an Office `.xlsx` opened in Google Sheets.
4. Create a JSON key for local development.
5. Share the Google Sheet or Drive file to the service account email with Editor access.
6. Put the JSON path in `GOOGLE_APPLICATION_CREDENTIALS`.

Editor access is required because the website can write updates back to `PRIORITY`, `STATUS`, `Actual Da`, and `Note`.

## Validate Environment

```bash
make env-check
```

This checks:

- `.env.local` exists.
- required env values are present.
- `GOOGLE_APPLICATION_CREDENTIALS` points to an existing file.

## Run Local Dev

```bash
make dev
```

Open the URL printed by Next.js.

## Production Build Check

```bash
make check
```

`make check` runs:

- env validation
- ESLint
- production build

Use this before handing off non-documentation code changes.
