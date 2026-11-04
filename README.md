# chatim-web

Web client cho **chatim** (hạ tầng chat dùng chung, multi-tenant). Một repo gồm hai phần:

- `packages/sdk`: SDK TypeScript không phụ thuộc framework, sản phẩm khác dùng lại được. Lo kết nối, token, nối lại, hàng lệnh, client protobuf/Connect.
- `apps/web`: web app React xây trên SDK.

Server nằm ở repo `chatim` (Go, chỉ làm server). Repo này làm đúng đặc tả client của server, không tự định nghĩa lại hành vi server.

> Trạng thái: chưa có code. Mới chốt hình dạng repo (SDK + web app). Stack, cách đăng nhập, tính năng và lộ trình **chưa bàn**.

## Mục tiêu

- SDK làm đúng đặc tả client của server chatim.
- Logic SDK được unit test kỹ; luồng chính trên web được test bằng Playwright.

## Stack (đề xuất, chưa chốt)

Vite + React 19 + TypeScript strict · Connect-web + protobuf-es (sinh code từ proto của chatim, ghim version) · TanStack Query · Tailwind + Radix · Vitest + React Testing Library · Playwright.

## Giao tiếp với server

- Lệnh ghi realtime đi qua **WebSocket** (frame nhị phân protobuf).
- Lệnh đọc và quản lý room đi qua **gateway HTTPS** (Connect), header `Authorization: Bearer`.
- Tenant và user chỉ lấy từ token. Chat không giữ đăng nhập: backend tenant ký JWT, `identity` đổi lấy token chat.
- **Chưa chốt:** ai đăng nhập người dùng và cấp JWT tenant. SDK nhận token qua hàm truyền vào; chưa làm UI login.

## Quy trình

Mọi việc lớn theo workflow trong [CLAUDE.md](CLAUDE.md): brainstorm → lưu quyết định → chia phase → summary từng phase → plan chi tiết → review → code → test → chốt lại. Yêu cầu phải có nguồn (đặc tả server, PRD đã chép vào `docs/`, hoặc quyết định của owner).

## Thư mục chính

```
packages/sdk/   SDK (transport, auth, reconnect, code sinh từ proto)
apps/web/       Web app React
docs/           Tài liệu đã chốt, tóm tắt plan từng phase (docs/plans/)
.memory/        Bộ nhớ chung cho agent
INDEXES.csv     Chỉ mục tra cứu codebase
CLAUDE.md       Quy ước cho agent
```
