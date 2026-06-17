# Architecture

## Stack

- Next.js `16.2.9` App Router
- React `19`
- TypeScript
- Tailwind CSS v4
- SWR for polling
- Google APIs for Sheets/Drive access
- Auth.js / NextAuth for Google login and magic-link sessions
- ExcelJS for Office `.xlsx` parsing
- Recharts for charts
- Sonner for toasts
- Lucide icons through `AppIcon`

## Routes

| Route | Purpose | Entry |
| --- | --- | --- |
| `/` | Overview and navigation cards | `src/app/page.tsx` |
| `/charts` | Dashboard charts only | `src/app/charts/page.tsx` |
| `/tasks` | Paginated task board | `src/app/tasks/page.tsx` |
| `/kanban` | Kanban board grouped by status | `src/app/kanban/page.tsx` |
| `/week` | Current week deadline board | `src/app/week/page.tsx` |
| `/login` | Google login, magic-link login, and access-denied state | `src/app/login/page.tsx` |
| `/api/tasks` | Server API for tasks | `src/app/api/tasks/route.ts` |
| `/api/auth/[...nextauth]` | Auth.js Google OAuth handlers | `src/app/api/auth/[...nextauth]/route.ts` |
| `/api/auth/magic/request` | Send a whitelisted magic login link by email | `src/app/api/auth/magic/request/route.ts` |
| `/api/auth/magic/callback` | Verify magic token and create Auth.js session | `src/app/api/auth/magic/callback/route.ts` |

## Main Components

| File | Responsibility |
| --- | --- |
| `src/components/site-chrome.tsx` | Shared site header, navigation, global reload button, footer |
| `src/components/task-dashboard.tsx` | Overview, charts view, task board view, filters, pagination |
| `src/components/kanban-tasks-page.tsx` | Kanban status columns, drag/drop status updates |
| `src/components/weekly-tasks-page.tsx` | Weekly task board grouped Monday to Sunday |
| `src/components/app-icon.tsx` | Central Lucide icon registry |
| `src/components/app-toaster.tsx` | Sonner toaster mount |
| `src/components/magic-link-form.tsx` | Client form for requesting email login links |

Route entry files stay small and delegate UI to components.
Global header/footer live in `src/app/layout.tsx` through `SiteHeader` and `SiteFooter`.

## Data Flow

```txt
Browser route
  -> SWR fetch('/api/tasks')
  -> src/app/api/tasks/route.ts
  -> getSheetTasks()
  -> src/lib/google-sheets.ts
  -> Google Sheets API or Drive API
  -> parse rows into SheetTask[]
  -> return TasksPayload
```

Client code never reads Google credentials. All Google API calls happen on the server.

## Access Control

- `src/proxy.ts` redirects unauthenticated page requests to `/login`.
- `/api/tasks` returns `401` or `403` JSON instead of task data when the session is missing or the email is not allowed.
- Allowed viewer emails come from `AUTH_ALLOWED_EMAILS`.
- Google Sheet service-account credentials stay server-side and separate from Google login.
- Magic links are HMAC-signed with `AUTH_SECRET`, expire after `MAGIC_LINK_TTL_MINUTES`, and only work for `AUTH_ALLOWED_EMAILS`.

Write-back flow:

```txt
/tasks row editor
  -> PATCH /api/tasks
  -> updateSheetTask()
  -> Sheets API values.batchUpdate for native Google Sheets
  -> or Drive download + ExcelJS edit + Drive upload for XLSX
  -> clear server cache
  -> force refresh tasks
```

## Google Sheet Reader

`src/lib/google-sheets.ts` supports two file types:

- native Google Sheets via Sheets API
- Office `.xlsx` via Drive API download + ExcelJS parsing/editing

Header detection looks for the row containing task/deadline headers and maps:

- `Tags`
- `System`
- `TASK`
- `Details`
- `PRIORITY`
- `STATUS`
- `Timeline` - expected duration in days
- `Date Rec`
- `Deadline`
- `Actual Da`
- `Note`

Write-back is intentionally limited to:

- `PRIORITY`
- `STATUS`
- `Actual Da`
- `Note`

## Cache

Task data is cached in server memory in `src/lib/google-sheets.ts`.

- TTL is controlled by `TASK_CACHE_TTL_MS`.
- Normal polling hits `/api/tasks` and may return cached data.
- The shared `Reload` button uses `/api/tasks?force=1`.
- Successful `PATCH /api/tasks` clears cache and returns a refreshed payload.
- Response metadata includes `meta.cache.status`:
  - `hit`
  - `miss`
  - `refresh`

## Sorting and Filters

Task board:

- Sorts by newest `Date Received` first.
- Tasks without `Date Received` go last.
- Supports status filter, deadline filter, search, and pagination.

Kanban board:

- Groups tasks by `STATUS`.
- Sorts cards by priority, overdue flag, then newest `Date Received`.
- Dragging a card to another column updates `STATUS` through `PATCH /api/tasks`.

Weekly board:

- Shows tasks with deadline in current Monday to Sunday window.
- Groups by deadline day.
- Prioritizes active tasks before done tasks.

## Styling Rules

- Keep pages focused; do not combine all sections into one long page.
- Preserve the current minimal rounded dashboard style.
- Use `AppIcon` for all icons.
- Add new icons to `src/components/app-icon.tsx`.
