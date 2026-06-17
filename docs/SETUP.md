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
AUTH_SECRET=replace-with-a-random-32-byte-secret
AUTH_GOOGLE_ID=your-google-oauth-client-id.apps.googleusercontent.com
AUTH_GOOGLE_SECRET=your-google-oauth-client-secret
AUTH_ALLOWED_EMAILS=you@example.com,teammate@example.com
AUTH_DEBUG=false
APP_BASE_URL=http://localhost:3000
```

Optional:

```txt
GOOGLE_XLSX_SHEET_NAME=To-Do List
GOOGLE_SHEET_RANGE="'To-Do List'!A1:O"
# RESEND_API_KEY=re_xxxxxxxxx
# MAGIC_LINK_FROM="2026 Tasks <login@your-domain.com>"
RESEND_API_KEY=
MAGIC_LINK_FROM=
MAGIC_LINK_TTL_MINUTES=15
```

For deployment providers that cannot read a local JSON file, use:

```txt
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50Iiwi...
```

Generate that one-line value from the service-account JSON file:

```bash
base64 < /absolute/path/to/service-account.json | tr -d '\n'
```

If the provider does not support a large base64 env value, use the email/private
key pair instead:

```txt
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"
```

Do not expose credentials in client code. Browser views only call `/api/tasks`.

## Google Login Setup

1. Create a Google OAuth Client ID in Google Cloud.
2. Add this local redirect URI:

```txt
http://localhost:3000/api/auth/callback/google
```

If the dev server uses another port, for example `3001`, replace `3000` with
that port in the Google OAuth redirect URI.

3. Put the OAuth client values in `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
4. Generate `AUTH_SECRET`:

```bash
openssl rand -base64 32
```

5. Put allowed viewer emails in `AUTH_ALLOWED_EMAILS`, separated by commas.

If `AUTH_ALLOWED_EMAILS` is empty, the app denies all users.

Set `AUTH_DEBUG=true` temporarily when debugging OAuth callback issues. Keep it
`false` in normal production runs.

## Magic Link Login Setup

Magic-link login lets a user enter an allowed email on `/login`, receive a short-lived
login link through Resend, then click it to create the same Auth.js session.
If Resend is not fully configured, the login page hides this option and keeps
Google login only.

1. Create a Resend API key with sending access.
2. Verify the sender domain in Resend.
3. Set Resend env values:

```txt
APP_BASE_URL=http://localhost:3000
# RESEND_API_KEY=re_xxxxxxxxx
# MAGIC_LINK_FROM="2026 Tasks <login@your-domain.com>"
RESEND_API_KEY=
MAGIC_LINK_FROM=
MAGIC_LINK_TTL_MINUTES=15
```

Only emails in `AUTH_ALLOWED_EMAILS` can use a magic link. The request endpoint
returns a generic success message so the UI does not reveal which emails are
allowed.

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
- `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` decodes to a service-account JSON if set.
- `GOOGLE_APPLICATION_CREDENTIALS` points to an existing file.
- `AUTH_ALLOWED_EMAILS` contains at least one email.
- if Resend magic-link env is present, `RESEND_API_KEY` and `MAGIC_LINK_FROM` are both present.

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
