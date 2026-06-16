# Operations

## Common Commands

```bash
make dev
make env-check
make lint
make build
make check
make audit
```

Use `make check` before handing off code changes.

## Force Reload Data

From the shared header, click `Reload`.

From terminal:

```bash
curl "http://localhost:3000/api/tasks?force=1"
```

If Next.js is running on another port, replace `3000`. This endpoint now
requires an authenticated browser session; unauthenticated terminal calls should
return `401`.

Expected response includes:

```json
{
  "tasks": [],
  "meta": {
    "cache": {
      "status": "refresh"
    }
  }
}
```

## Check API Quickly

```bash
curl "http://localhost:3000/api/tasks"
```

Useful fields:

- `tasks.length`
- `meta.updatedAt`
- `meta.cache.status`
- `meta.cache.ageMs`
- `meta.cache.ttlMs`

## Update Task Back To Sheet

From the UI, open `/tasks` and click `Sửa Sheet` on a task row.

From terminal:

```bash
curl -X PATCH "http://localhost:3000/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{"rowNumber":4,"updates":{"status":"In Progress","priority":"Medium","actualDate":"2026-06-16","note":"Updated from website"}}'
```

Writable fields are:

- `status`
- `priority`
- `actualDate`
- `note`

`actualDate` must be empty or `YYYY-MM-DD`.

## Troubleshooting

### `Cần cấu hình Google Service Account`

Likely causes:

- `.env.local` missing
- `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` invalid or not decoded from the full JSON key file
- `GOOGLE_APPLICATION_CREDENTIALS` path invalid
- service account JSON missing
- Sheet not shared to service account email
- Google Sheets API or Drive API not enabled

Run:

```bash
make env-check
```

### Cannot Login With Google

Likely causes:

- `AUTH_GOOGLE_ID` missing or wrong
- `AUTH_GOOGLE_SECRET` missing or wrong
- `AUTH_SECRET` missing
- Google OAuth callback URL not configured
- signed-in email is not listed in `AUTH_ALLOWED_EMAILS`

For short-lived debugging, set `AUTH_DEBUG=true` and inspect server logs. Turn it
back to `false` after the issue is fixed.

### Cannot Receive Magic Login Link

Likely causes:

- `MAGIC_LINK_SMTP_HOST`, `MAGIC_LINK_SMTP_USER`, or `MAGIC_LINK_SMTP_PASS` missing
- Gmail sender does not have 2-Step Verification and App Password enabled
- `APP_BASE_URL` points to the wrong local port or deploy domain
- target email is not listed in `AUTH_ALLOWED_EMAILS`
- the link expired; default TTL is `MAGIC_LINK_TTL_MINUTES=15`

Run:

```bash
make env-check
```

Then try `/login` again. The UI intentionally returns a generic success message
for unknown emails so the app does not reveal the whitelist.

### `File không phải Google Sheet hoặc XLSX`

The Drive file MIME type is not supported. Confirm the file is a native Google Sheet or Office spreadsheet file.

### XLSX Parse Errors

Likely causes:

- changed header names
- unsupported cell format
- wrong workbook tab

Checks:

- set `GOOGLE_XLSX_SHEET_NAME=To-Do List`
- set `GOOGLE_SHEET_RANGE="'To-Do List'!A1:N"` if using native Sheets
- confirm the header row still contains task and deadline columns

### UI Still Shows Old Data

Use one of:

- click `Reload`
- call `/api/tasks?force=1`
- lower `TASK_CACHE_TTL_MS` during debugging
- restart `make dev` if module-level cache should be cleared

### Cannot Write Back To Sheet

Likely causes:

- Sheet or Drive file is shared as Viewer instead of Editor
- Google Sheets API or Drive API not enabled
- service account in `.env.local` is not the email that has Editor access
- row number no longer matches the current Sheet after manually moving rows

## Release Checklist

Before handing off code changes:

```bash
make check
```

Then verify manually:

- `/`
- `/charts`
- `/tasks`
- `/kanban`
- `/week`
- `/api/tasks`

For documentation-only changes, `make check` is optional.
