# Project Documentation

Tài liệu vận hành và phát triển cho `2026 To-do Cockpit`.

## Tài liệu chính

- [Setup](./SETUP.md): cài dependencies, cấu hình `.env.local`, Google service account, chạy local.
- [Architecture](./ARCHITECTURE.md): stack, routes, components, data flow, cache.
- [Operations](./OPERATIONS.md): kiểm tra dữ liệu, force reload, troubleshooting, checklist trước khi giao.
- [Google Sheet Events](./GOOGLE_SHEET_EVENTS.md): Apps Script webhook để refresh app khi Google Sheet đổi.

## Quick Start

```bash
make install
make env-check
make dev
```

Mở app ở URL dev server hiển thị trong terminal, thường là:

```txt
http://localhost:3000
```

Nếu port `3000` bận, Next.js có thể tự dùng port khác như `3001`.

## Routes

- `/`: tổng quan và điều hướng.
- `/charts`: biểu đồ trạng thái, priority, workload, deadline.
- `/tasks`: task board có filter, search, sort, phân trang.
- `/week`: task có deadline trong tuần hiện tại từ thứ 2 tới chủ nhật.

## Agent Notes

Các agent/coding assistant phải đọc [`../AGENTS.md`](../AGENTS.md) trước khi sửa code.
