# Deploy Dokploy

This project deploys well as a Docker Compose app on Dokploy.

## Files

- `Dockerfile`: builds the Next.js app with standalone output.
- `docker-compose.dokploy.yml`: Dokploy Compose entrypoint.
- `/api/health`: container healthcheck endpoint.

## Dokploy Setup

1. Create a new project in Dokploy.
2. Create a Docker Compose service from this Git repository.
3. Set the Compose path to:

```text
docker-compose.dokploy.yml
```

4. In the Dokploy environment UI, add these variables:

```env
GOOGLE_SHEET_ID=1Sv86oc9zXbvwSsD956uT4opSU8JqP04s
GOOGLE_SHEET_GID=689856921
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50Iiwi...
NEXT_PUBLIC_TASK_POLLING_MS=15000
TASK_CACHE_TTL_MS=60000
AUTH_SECRET=replace-with-a-random-32-byte-secret
AUTH_GOOGLE_ID=your-google-oauth-client-id.apps.googleusercontent.com
AUTH_GOOGLE_SECRET=your-google-oauth-client-secret
AUTH_ALLOWED_EMAILS=you@example.com,teammate@example.com
AUTH_DEBUG=false
APP_BASE_URL=https://your-domain.com
MAGIC_LINK_SMTP_HOST=smtp.gmail.com
MAGIC_LINK_SMTP_PORT=465
MAGIC_LINK_SMTP_USER=your-gmail@gmail.com
MAGIC_LINK_SMTP_PASS=your-gmail-app-password
MAGIC_LINK_FROM="2026 Tasks <your-gmail@gmail.com>"
MAGIC_LINK_TTL_MINUTES=15
```

Optional values:

```env
GOOGLE_SHEET_RANGE="'To-Do List'!A1:O"
GOOGLE_XLSX_SHEET_NAME=To-Do List
```

5. Share the Google Sheet with the service account email as Editor.
6. Add a domain in Dokploy and route it to service port `3000`.
7. In Google Cloud OAuth, add this callback URL:

```text
https://your-domain.com/api/auth/callback/google
```

8. Deploy.

Magic-link login does not need a Google OAuth callback, but `APP_BASE_URL` must
match the public Dokploy domain so the email link points back to the deployed
site.

## Credential Notes

Prefer `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` on Dokploy. It stores the whole
service-account JSON as one line, so Docker Compose does not break on private
key newlines.

Generate it locally:

```bash
base64 < /absolute/path/to/service-account.json | tr -d '\n'
```

Paste the output into Dokploy:

```env
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50Iiwi...
```

`GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` are
still supported, but the private key must stay on one physical `.env` line with
literal `\n` separators:

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"
```

`GOOGLE_APPLICATION_CREDENTIALS` is still supported for local development if it points to a mounted JSON file, but the Compose file does not mount one by default.

Set `AUTH_DEBUG=true` only while debugging login issues, then switch it back to `false`.

For Gmail magic-link login, use a Gmail App Password in `MAGIC_LINK_SMTP_PASS`.
Do not use the normal Gmail password.

## Local Docker Test

```bash
make docker-build
make docker-run
```

Then open:

```text
http://localhost:3000/api/health
http://localhost:3000
```

## Healthcheck

The Docker image and Compose service both check:

```text
GET /api/health
```

This endpoint only verifies that the Next.js server is running. It does not call Google Sheets.

## Build Speed Notes

The first Dokploy build is usually slow because Docker has to download the base image, install all pnpm dependencies, and compile Next.js from a cold cache.

The Dockerfile is optimized for repeat deploys:

- pnpm dependencies use a BuildKit cache mount.
- Next.js build cache is persisted at `/app/.next/cache` through a BuildKit cache mount.
- The builder stage copies only app build inputs (`src`, `public`, and config files), so docs-only changes do not invalidate the Next.js build layer.

If deploys are still too slow, the next step is building the Docker image in GitHub Actions and configuring Dokploy to pull the prebuilt image from GHCR instead of building on the server.
