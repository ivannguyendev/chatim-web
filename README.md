# chatim-web

Web client cho **chatim** (hạ tầng chat dùng chung, single-tenant). Một repo gồm hai phần:

- `packages/sdk`: SDK TypeScript không phụ thuộc framework, sản phẩm khác dùng lại được. Lo kết nối, token, nối lại, hàng lệnh, client HTTP + WebSocket.
- `apps/web`: web app React xây trên SDK, bao gồm màn hình đăng nhập.

Server nằm ở repo `chatim` (Go, chỉ làm server). Repo này làm đúng đặc tả client của server, không tự định nghĩa lại hành vi server.

> Trạng thái: chưa có code. Đã chốt hình dạng repo (SDK + web app), single-tenant, không dùng RPC (dùng HTTP + WebSocket), có trang login.

## Mục tiêu

- SDK làm đúng đặc tả client của server chatim.
- Logic SDK được unit test kỹ; luồng chính trên web được test bằng Playwright.

## Stack (đề xuất)

Vite + React 19 + TypeScript strict · HTTP (fetch) + WebSocket · TanStack Query · Tailwind + Radix · Vitest + React Testing Library · Playwright.

## Giao tiếp với server

- Lệnh ghi realtime đi qua **WebSocket** (frame nhị phân protobuf).
- Lệnh đọc, quản lý room và xác thực đi qua **HTTP Gateway**, header `Authorization: Bearer`.
- User lấy từ token. Client có sẵn màn hình đăng nhập để xác thực và lấy token.

## Quy trình

Mọi việc lớn theo workflow trong [CLAUDE.md](CLAUDE.md): Brainstorming → Reviewer chia phase → Tóm tắt plan từng phase (`docs/plans/*-summary.md` – cần Owner duyệt) → Plan chi tiết → Review plan chi tiết → Thực thi code → Kiểm thử → Close-out (Cập nhật CLAUDE.md, đề xuất .memory/, đề xuất Decision Log, đề xuất cập nhật INDEXES.csv). Yêu cầu phải có tài liệu trong `docs/` trước khi code.

## Thư mục chính

```
packages/sdk/   SDK (transport HTTP + WebSocket, auth, reconnect, protobuf)
apps/web/       Web app React (bao gồm trang login)
docs/           Tài liệu đã chốt, tóm tắt plan từng phase (docs/plans/), quyết định đã chốt (docs/decisions/)
.memory/        Bộ nhớ chung cho agent
INDEXES.csv     Chỉ mục tra cứu codebase
CLAUDE.md       Quy ước cho agent
```
