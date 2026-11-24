# Tóm tắt Kế hoạch Triển khai: Phase 1 — Khởi tạo Monorepo & Khung Source Code

**Mã tài liệu:** `261124-scaffold-p1-summary`  
**Ngày lập:** 2026-11-24  
**Trạng thái:** Chờ Duyệt (Draft)  
**Phạm vi:** Phase 1 trong chuỗi phát triển `chatim-web`.

---

## 1. Mục tiêu (Goal)

Thiết lập nền móng Monorepo hoàn chỉnh cho `chatim-web` bằng `pnpm workspaces`, bao gồm gói thư viện `packages/sdk` (TypeScript thuần) và ứng dụng `apps/web` (React 19 + Vite + Tailwind + Radix). Chuẩn hóa toàn bộ bộ công cụ (Biome, Vitest, TypeScript strict), thiết lập quy trình tự động sinh mã Protobuf (`pnpm codegen`) từ `chatim`, và đảm bảo toàn bộ pipeline build, lint, test xanh 100%.

---

## 2. Phạm vi Công việc (Scope)

### Trong phạm vi (In-Scope)

1. **Monorepo Root Setup:**
   - Cấu hình `pnpm-workspace.yaml` quản lý `packages/*` và `apps/*`.
   - Root `package.json` định nghĩa các scripts dùng chung: `dev`, `build`, `test`, `lint`, `format`, `codegen`, `setup-dev`.
   - Cấu hình TypeScript nền tảng `tsconfig.base.json` (strict mode, target ES2022).
   - Cấu hình Biome `biome.json` cho linter và formatter toàn bộ dự án.
   - `.editorconfig` và `.nvmrc` (Node v22).
2. **`packages/sdk` (Nền tảng SDK):**
   - Cấu hình `package.json`, `tsconfig.json`.
   - Cấu hình Buf codegen `buf.gen.yaml` chỉ sinh mã TypeScript cho các message Protobuf (`@bufbuild/protoc-gen-es` / `@bufbuild/protobuf`) phục vụ frame nhị phân WebSocket; KHÔNG dùng plugin RPC.
   - Script `pnpm codegen` đọc từ `../chatim/proto` để sinh mã serialization cho WebSocket frames (`ClientFrame`, `ServerFrame`) vào `src/gen/`.
   - Khung thư mục chuẩn hóa: `src/transport/`, `src/auth/`, `src/queue/`, `src/directory/`, `src/config/`.
   - File `src/config/validator.ts` kiểm tra tính ăn khớp của các timer (Heartbeat < 15s server timeout) kèm unit test mẫu bằng Vitest.
3. **`apps/web` (Nền tảng Webapp):**
   - Khởi tạo Vite + React 19 + TypeScript strict.
   - Cấu hình Tailwind CSS và tích hợp Radix UI primitives.
   - Cấu hình TanStack Query Provider trong App Shell.
   - Module `src/lib/env.ts` kiểm tra cú pháp biến môi trường và cung cấp fallback mặc định cho local dev (`localhost:8081`, `localhost:8082`, `localhost:8084`) — Zero-config dev.
   - Khung cấu trúc thư mục Feature-driven: `src/features/{auth, shell, rooms, messages, threads, members}/`.
   - File hằng số UI text `src/constants/ui-copy.ts` và App Shell tối thiểu hiển thị trạng thái kết nối `ConnectionBanner`.
4. **Kiểm thử & Tài liệu:**
   - Cấu hình Vitest cho `packages/sdk` và `apps/web`.
   - Cập nhật `INDEXES.csv` phản ánh các file cấu hình và thư mục mới được tạo.

### Ngoài phạm vi (Out-of-Scope)

- Chưa cài đặt logic chi tiết kết nối WebSocket binary frames (thuộc Phase 2 / SDK Phase).
- Chưa dựng toàn bộ UI các trang chat, danh sách tin nhắn, upload S3.
- Chưa cấu hình Playwright E2E.

---

## 3. Sản phẩm Bàn giao (Deliverables)

| Sản phẩm              | Vị trí                                                                    | Tiêu chuẩn bàn giao                                                                     |
| :-------------------- | :------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------- |
| **Monorepo Config**   | `package.json`, `pnpm-workspace.yaml`, `biome.json`, `tsconfig.base.json` | Cài đặt sạch sẽ, liên kết workspace nội bộ `workspace:*` thông suốt.                    |
| **SDK Foundation**    | `packages/sdk/`                                                           | `pnpm codegen` sinh mã protobuf thành công; `pnpm test` chạy xanh test timer validator. |
| **Webapp Foundation** | `apps/web/`                                                               | `pnpm dev` khởi chạy trang chào App Shell không lỗi console; zero-config dev.           |
| **Code Index**        | `INDEXES.csv`                                                             | Bổ sung đầy đủ các dòng chỉ mục cho các file/thư mục mới.                               |

---

## 4. Tiêu chí Chấp nhận (Acceptance Criteria)

1. `pnpm install`: Hoàn tất không xung đột dependency, không warning nghiêm trọng.
2. `pnpm codegen`: Đọc thành công proto từ `../chatim/proto` và tạo ra mã TypeScript trong `packages/sdk/src/gen/`.
3. `pnpm lint`: Lệnh `biome check .` chạy không có lỗi cú pháp hoặc cảnh báo format.
4. `pnpm test`: Vitest chạy qua 100% các unit test mẫu của SDK và Webapp.
5. `pnpm build`: Build thành công cả gói `packages/sdk` và ứng dụng `apps/web` (Vite build dist không lỗi typecheck).
6. `pnpm dev`: Khởi động được dev server của Webapp, mở trình duyệt hiển thị App Shell chào đón và chuỗi text từ `ui-copy.ts`.

---

## 5. Căn cứ & Tài liệu Tham chiếu (Evidence Sources)

- Backend `chatim` repo: `proto/chatim/v1/*.proto`, `proto/chatim/identity/v1/directory.proto`.
- [CLAUDE.md](file:///Users/ivannguyen/Projects/ivannguyendev/chatim-web/CLAUDE.md)
- Hồ sơ thiết kế: [`.agent/plans/261124-scaffold-design.md`](file:///Users/ivannguyen/Projects/ivannguyendev/chatim-web/.agent/plans/261124-scaffold-design.md)
- Nguyên tắc an toàn vận hành: [`.memory/ops-setup-hard-to-get-wrong.md`](file:///Users/ivannguyen/Projects/ivannguyendev/chatim-web/.memory/ops-setup-hard-to-get-wrong.md)

---

## 6. Rủi ro & Biện pháp Xử lý (Risks & Mitigations)

| Rủi ro                                           | Mức độ | Biện pháp xử lý                                                                                                                           |
| :----------------------------------------------- | :----: | :---------------------------------------------------------------------------------------------------------------------------------------- |
| **Tương thích cú pháp Protobuf v2/v3**           |  Thấp  | Cấu hình `@bufbuild/protobuf` sinh mã ES Modules thuần cho `ws.proto` để encode/decode binary frame, không cài đặt runtime RPC thừa thãi. |
| **Môi trường dev thiếu biến PATH cho Node/pnpm** |  Thấp  | Cung cấp file `.nvmrc` và script wrapper nếu cần; hướng dẫn rõ ràng trong README.                                                         |
