# 2026 To-do Cockpit

Next.js dashboard đọc task từ Google Sheet private bằng Google Sheets API, cho phép cập nhật lại một số field vận hành về Sheet, sau đó client polling `/api/tasks` để cập nhật timeline trên website.

## Tài liệu dự án

- [docs/README.md](./docs/README.md): mục lục tài liệu.
- [docs/SETUP.md](./docs/SETUP.md): cài đặt local, Google service account, `.env.local`.
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md): routes, components, data flow, cache.
- [docs/OPERATIONS.md](./docs/OPERATIONS.md): force reload, troubleshooting, checklist.
- [docs/DEPLOY_DOKPLOY.md](./docs/DEPLOY_DOKPLOY.md): deploy bằng Dokploy.

## Cấu hình Google Sheet private

1. Tạo Google Cloud service account.
2. Enable Google Sheets API cho project đó.
3. Nếu file vẫn là Office `.xlsx`, enable thêm Google Drive API.
4. Tạo key JSON cho service account.
5. Share Google Sheet cho email service account với quyền Editor.
6. Tạo `.env.local` từ `.env.example`.

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
```

Nếu deploy lên nơi không đọc được file JSON local, dùng cặp env
`GOOGLE_SERVICE_ACCOUNT_EMAIL` và `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` thay cho
`GOOGLE_APPLICATION_CREDENTIALS`.

Google login dùng Auth.js. Chỉ email trong `AUTH_ALLOWED_EMAILS` mới xem được
website và gọi `/api/tasks`. Google OAuth callback URL:

Set `AUTH_DEBUG=true` temporarily when debugging OAuth callback issues.

```txt
http://localhost:3000/api/auth/callback/google
```

Nếu dev server chạy port khác như `3001`, đổi callback URL theo đúng port đó.

Nếu file trên Drive vẫn là Office `.xlsx`, app sẽ tải workbook qua Drive API và
parse sheet đầu tiên. Có thể set `GOOGLE_XLSX_SHEET_NAME=To-Do List` nếu muốn
chỉ định tab cụ thể.

## Chạy local

```bash
pnpm install
pnpm dev
```

Mở [http://localhost:3000](http://localhost:3000).

## Makefile

Các lệnh hay dùng:

```bash
make dev
make check
make env-check
make lint
make build
make audit
make docker-build
make docker-run
```

`make check` sẽ chạy kiểm tra `.env.local`, ESLint và production build.

## Mapping cột

App tự tìm dòng header có `TASK` và `Deadline`, rồi đọc các cột:

- `Tags`
- `System`
- `TASK`
- `Details`
- `PRIORITY`
- `STATUS`
- `Date Rec`
- `Deadline`
- `Actual Da`
- `Note`

Nếu tên sheet/range khác cấu trúc hiện tại, set thêm:

```txt
GOOGLE_SHEET_RANGE="'To-Do List'!A1:N"
```

## Polling

Client dùng SWR và refresh theo `NEXT_PUBLIC_TASK_POLLING_MS`, mặc định `15000ms`.

## Kanban

Trang `/kanban` nhóm task theo `STATUS`. Kéo card sang column khác hoặc bấm nút
status trên card sẽ gọi `PATCH /api/tasks` để ghi `STATUS` ngược về Sheet.

## Write-back

Header có nút `Tạo task` để append dòng mới vào Google Sheet. Trang `/tasks`
có form `Sửa Sheet` cho từng task. App hiện ghi ngược các cột:

- `PRIORITY`
- `STATUS`
- `Actual Da`
- `Note`

Khi tạo task mới, app ghi các cột `Tags`, `System`, `TASK`, `Details`,
`PRIORITY`, `STATUS`, `Date Rec`, `Deadline`, `Actual Da`, `Note` nếu sheet có
các header tương ứng. Sau khi lưu, API xóa cache server và reload lại dữ liệu từ
Sheet.

## Icons

Dự án dùng `lucide-react` qua wrapper chung:

```tsx
import { AppIcon } from "@/components/app-icon";

<AppIcon name="refresh" className="size-4" />
```

Khi cần icon mới, thêm icon vào registry trong `src/components/app-icon.tsx`
thay vì import rải rác ở nhiều component.
