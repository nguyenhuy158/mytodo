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
AUTH_URL=https://task.huycode.click
NEXTAUTH_URL=https://task.huycode.click
APP_BASE_URL=https://task.huycode.click
TASK_BACKUP_DIR=/app/task-backups
# RESEND_API_KEY=re_xxxxxxxxx
# MAGIC_LINK_FROM="2026 Tasks <login@your-domain.com>"
RESEND_API_KEY=
MAGIC_LINK_FROM=
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
https://task.huycode.click/api/auth/callback/google
```

8. Deploy.

`AUTH_URL`, `NEXTAUTH_URL`, and `APP_BASE_URL` must match the public Dokploy
domain. Do not set them to `0.0.0.0` or the internal container port; Auth.js will
use these values for OAuth redirects. Magic-link login does not need a Google
OAuth callback, but it only appears when `RESEND_API_KEY` and `MAGIC_LINK_FROM`
are both configured.

`docker-compose.dokploy.yml` mounts a named volume at `/app/task-backups`.
Keep `TASK_BACKUP_DIR=/app/task-backups` so `Backup now` can write snapshots
as the non-root `nextjs` user and backups survive container replacement.

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

For magic-link login, use a Resend sender from a verified domain in
`MAGIC_LINK_FROM`. If Resend is not configured, users can still log in with
Google only.

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
- Next.js build cache is persisted at `/app/.next/cache` through a BuildKit cache mount. This includes Turbopack's filesystem cache (`.next/cache/turbopack`).
- Docker builds use `corepack pnpm run build:docker`, which runs `next build` with Turbopack (the default bundler in Next.js 16). Turbopack is markedly faster than `--webpack` and, with `experimental.turbopackFileSystemCacheForBuild` enabled in `next.config.ts`, a warm rebuild reuses the cached compilation.
- The builder stage copies only app build inputs (`src`, `public`, and config files), so docs-only changes do not invalidate the Next.js build layer.

Measured locally (cold pnpm cache):

| Build | Time |
| ----- | ---- |
| `next build --webpack` (previous), cold | ~1m52s |
| `next build` (Turbopack), cold | ~0m54s |
| `next build` (Turbopack), warm FS cache | ~0m23s |

### Keep Dokploy build cache enabled

The warm (~sub-minute) rebuild only happens when Dokploy reuses the Docker build cache between deploys. To keep it fast:

- Do **not** enable "Clean Cache" / "Force rebuild (no cache)" on the Dokploy application — that wipes both the layer cache and the BuildKit cache mounts, forcing a full cold build every time (this is the usual cause of every deploy taking 10+ minutes).
- Leave BuildKit enabled (default for Docker Compose v2 builds), so the `--mount=type=cache` mounts work.
- Because the `deps` stage only copies `package.json` + `pnpm-lock.yaml`, the dependency-install layer stays cached as long as those files do not change.

If deploys are still too slow, the next step is building the Docker image in GitHub Actions and configuring Dokploy to pull the prebuilt image from GHCR instead of building on the server.
