<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project Agent Guide

## Mandatory Workflow

- Always read this `AGENTS.md` before making changes in this repository.
- Do not use `sed` to edit files. Use `apply_patch` for manual edits.
- If the request is unclear or could change product behavior in more than one reasonable way, ask the user before implementing.
- Preserve unrelated user changes in the working tree. Do not revert files unless explicitly requested.
- Use `corepack pnpm` or the `Makefile`; do not introduce another package manager.

## Stack

- Framework: Next.js `16.2.9` App Router.
- Runtime: React `19`, TypeScript, Tailwind CSS v4.
- Data: private Google Sheet or Office XLSX opened in Google Sheets.
- Server reader: `src/lib/google-sheets.ts`.
- API route: `src/app/api/tasks/route.ts`.
- Main client views:
  - `/`: overview only.
  - `/charts`: charts only.
  - `/tasks`: paginated task board.
  - `/kanban`: Kanban board grouped by status.
  - `/week`: current week task view.

## Commands

- Install deps: `make install`
- Dev server: `make dev`
- Validate repo: `make check`
- Lint only: `make lint`
- Build only: `make build`
- Env validation: `make env-check`

Run `make check` after code changes that affect TypeScript, Next.js routes, API behavior, or UI components.

## Environment

Required local env values live in `.env.local`; safe defaults/examples live in `.env.example`.

- `GOOGLE_SHEET_ID`
- `GOOGLE_SHEET_GID`
- `GOOGLE_APPLICATION_CREDENTIALS`
- `NEXT_PUBLIC_TASK_POLLING_MS`
- `TASK_CACHE_TTL_MS`
- Optional: `GOOGLE_XLSX_SHEET_NAME`
- Optional: `GOOGLE_SHEET_RANGE`

Never commit service account JSON files or secrets. Browser code must not read private credentials.

## Data Flow

- Client views fetch `/api/tasks` with SWR polling.
- `/api/tasks` calls `getSheetTasks()` from `src/lib/google-sheets.ts`.
- Server cache is module-level in `src/lib/google-sheets.ts`.
- Use `/api/tasks?force=1` for force reload from Google Sheet or Drive.
- `TasksPayload` and task domain types live in `src/lib/tasks.ts`.

## UI Rules

- Keep pages focused. Do not put overview, charts, full task board, and weekly board on one long page.
- Use the shared `SiteHeader` and `SiteFooter` from root layout; do not add per-page navigation headers.
- Reuse `AppIcon` from `src/components/app-icon.tsx`; add new Lucide icons to that registry instead of importing icons across components.
- Keep styling aligned with the current minimal, rounded, soft-dashboard visual language.
- For task lists, preserve current sorting behavior unless the user asks otherwise:
  - task board sorts by newest `Date Received`.
  - weekly view groups by deadline day from Monday to Sunday.

## Next.js Guidance

- Before changing App Router files, route handlers, metadata, navigation, caching, or server/client component boundaries, read the relevant docs under `node_modules/next/dist/docs/`.
- Client components that use state, SWR, event handlers, or browser behavior need `"use client"`.
- Route entry files should stay small and delegate UI to components under `src/components`.
