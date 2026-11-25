# Tóm tắt Kế hoạch: Phase 3a — Vá SDK & Đăng nhập dev thật

**Mã tài liệu:** `261124-sdk-fixes-p3a-summary`  
**Ngày lập:** 2026-11-24 · **Cập nhật theo bản build:** 2026-11-25  
**Trạng thái:** Đã Hoàn thành (Actual Build), branch `feat/sdk-fixes-p3a`  
**Vị trí:** chèn giữa P3 Task 4 (đã xong) và P3 Task 5–8.

---

## 1. Câu chuyện (giá trị thật từ lần chạy với cụm `chatim` local)

1. **Chuẩn bị, một lệnh:** `pnpm dev:issuer` sinh khoá ES256 (`kid: web-71f43ff2cbc5`) trong `.local/dev-issuer/`, đăng ký tenant `dev`, issuer `chatim-web-dev` và khoá công khai ở identity. Gõ lại: "already active", không lỗi.
2. **Đăng nhập:** bấm "Lan" → app gọi `GET /__dev/subject-token?user=lan&name=Lan Nguyễn`; middleware Vite ký JWT `{iss: "chatim-web-dev", sub: "lan", aud: "chatim", exp: iat + 300, name}`. SDK đổi ở `POST /v1/token`, nhận token chat; `getMyUserId()` = `"2kt8hN7mG6L"`; `ready` sau 157ms. Alice ở tab khác = `"1Cjxd6P8sGo"`. `GetMyProfile` trả "Lan Nguyễn".
3. **Gửi tin:** `sendMessage("3cSuFSuZYdY", "Lô hàng sáng nay", cid)` → `response{id, code: 0, seq: 144}` → Promise trả `{cid, seq: 144, createdAtMs}`. Chưa kết nối → từ chối ngay `not_connected`; socket đóng khi đang chờ → `connection_lost`; 10s không trả lời → `timeout`; code khác 0 → `server_error` kèm code.
4. **Nối lại:** sau mọi `ready`, SDK tự gửi lại `open_room` các phòng đang mở và `watch_presence`. Nhận `resync` trên kết nối đang chạy → gửi lại `open_room` (owner chốt 2026-11-25: phòng mở lúc bị tạm ngừng đã bị server bỏ), không gửi lại `watch_presence`.
5. **Nạp phòng lỗi:** `load_failed{retry_after_ms: 2000}` → `load_rooms` sau 2000ms + 0–999ms; heartbeat vẫn chạy nên server không đóng 15s.
6. **Đã đọc:** `markRead(…, 144)` gửi ngay; 145, 146 trong 1s → gửi 146 khi hết 1s; `closeRoom` gửi phần chờ trước `close_room`; `listMyRooms()` chờ MarkRead đang bay.

---

## 2. Mục tiêu

Chạy được với server `chatim` thật: đăng nhập dev bằng nút bấm, SDK làm đủ các luật client §11 mà P2 còn thiếu, mỗi luật có unit test. **Đạt.**

---

## 3. Phạm vi đã build

- **Hợp đồng:** `docs/chatim-client-contract.md`, ghim `chatim` @ `cb08e861`.
- **SDK:** lệnh có trả lời (`CommandTracker`), `sendMessage()` trả Promise, nhớ phòng/watch và gửi lại sau `ready`/`resync`, `load_failed` → `load_rooms`, heartbeat từ lúc mở socket, backoff khi bắt tay lỗi, `MarkReadThrottle`, `getMyUserId()`, validator `commandTimeoutMs`/`markReadIntervalMs`.
- **Web:** dev issuer (`pnpm dev:issuer`, middleware chỉ `vite serve` + loopback + Host local), `AuthProvider` lấy token đã ký, `App` nối tối thiểu login → `ChatimProvider` → banner.
- **Ngoài phạm vi (giữ nguyên):** UI dùng API mới (P3), `MarkUnread`, xếp hàng lệnh, thử lại `429`/`503` khi đổi token, đăng nhập production.

---

## 4. Sản phẩm bàn giao

| Sản phẩm | Vị trí |
| :--- | :--- |
| Hợp đồng client | `docs/chatim-client-contract.md` |
| Transport, lệnh, MarkRead, client | `packages/sdk/src/transport/`, `reads/`, `client.ts`, `auth/token.ts`, `directory/batcher.ts`, `config/validator.ts` |
| Dev issuer + middleware | `apps/web/dev-issuer/`, `apps/web/vite.config.ts`, `apps/web/tsconfig.node.json`, script `dev:issuer` |
| Auth + App | `apps/web/src/features/auth/`, `apps/web/src/app/App.tsx` |
| Test | `packages/sdk/test/`, `apps/web/test/` |
| Chỉ mục | `INDEXES.csv` |

---

## 5. Tiêu chí chấp nhận → kết quả

| # | Tiêu chí | Kết quả |
| :--- | :--- | :--- |
| 1 | lint, typecheck, test, build xanh | `pnpm lint` 0 · SDK tsc/build 0 · web typecheck 0 · `pnpm build` 0 · **SDK 68/68, web 46/46**, không flaky |
| 2 | Mỗi luật có test riêng (fake socket, fake timers), viết test trước | Đạt; mỗi test mới được xác nhận fail trước khi code |
| 3 | Với server thật: Lan và Alice nhận `ready` | Đạt bằng script dùng chính SDK (`ready` 157ms / 23ms, id Base62 đúng dạng, `ListMyRooms` OK, tên hiển thị đúng). Bấm nút trên trình duyệt: owner tự xem |
| 4 | `apps/web/dist` không chứa `__dev` hay khoá | `grep -rl "__dev\|PRIVATE KEY" apps/web/dist` → không có |

Middleware trên dev server thật: GET local 200, Host lạ 403, POST 405.

---

## 6. Khác biệt so với bản duyệt

| # | Khác biệt | Lý do |
| :--- | :--- | :--- |
| 1 | Heartbeat chạy từ lúc mở socket | F09:441; user bị tạm ngừng không bị đóng sau 15s |
| 2 | `App.tsx` nối tối thiểu | Để kiểm tiêu chí 3; P3 Task 8 mở rộng |
| 3–7 | Dev issuer ở `apps/web/dev-issuer/`, hằng số dùng chung, `kid` từ khoá công khai, `getMyUserId()` dạng Promise, `@types/node` + `tsconfig.node.json` + Node ≥ 22.18 | Không lệch giá trị; khoá mới không trùng khoá cũ |
| 8 | `sendMessage()` trả `{cid, seq, createdAtMs}` | UI cần `cid` để khớp tin optimistic |
| 9 | Token dev có claim `name` | Identity mới lưu tên hiển thị |
| 10, 13 | Lấy token lỗi hoặc socket đóng trước `open` → backoff 1s, 2s, 4s… | Tránh vòng lặp nối lại; trình duyệt báo 503 lúc bắt tay thành 1006 |
| 11 | Dọn timer `retry_later`; huỷ `load_rooms` khi có `resync` | `close()` không sót timer |
| 12 | App vẫn truyền `session.userId`; đổi sang `getMyUserId()` ở P3 | Đúng phạm vi |
| 14 | Gửi lại `open_room` khi `resync` | Owner chốt 2026-11-25 |
| 15 | Sửa thêm từ review và server thật: bỏ kết quả token cũ sau `close()`; cô lập handler; `connect()` huỷ lần nối lại đang chờ; typing/`close_room` chỉ gửi khi đang chạy (F09:237); `TokenManager` bỏ kết quả đổi token về sau khi đã huỷ (trước đây tự gia hạn mãi); `AuthProvider` bỏ token của phiên đã đổi; throttle chịu được lỗi ném đồng bộ; `markReadIntervalMs` chặn `NaN`; `getMyProfile` bóc `{profile}` (trước trả sai dạng) | Lỗi thật, mỗi lỗi có test fail trước |

---

## 7. Đã biết, chưa xử lý

- `auth_required` chưa được transport xử lý (trạng thái vẫn `running`).
- `MarkUnread` chưa có; throttle không bỏ seq ≤ seq đã gửi; `markRead` ngay sau `closeRoom` được gửi ngay.
- **P3 phải sửa trước khi UI gửi tin:** adapter web khai `sendMessage(): void` nên Promise bị bỏ (lỗi thành unhandled rejection).
- `dist` của SDK dùng import không đuôi: chỉ dùng qua bundler, Node chạy thẳng không được (có từ P2).
- Typecheck SDK không kiểm file test; `connect()` lỗi tạo socket thì trạng thái vẫn `connecting` (có từ trước).
- Dev issuer: không siết lại quyền file khoá đã có; audience cứng `chatim` (đúng compose dev).
- Dạng JSON từng phòng của `ListMyRooms` chưa kiểm với server thật (chưa có phòng) → kiểm ở P3.
- Đề xuất item bên `chatim`: ghi rõ F09:496 chỉ áp cho phòng mở trước khi bị tạm ngừng.

---

## 8. Rủi ro còn lại

| Rủi ro | Xử lý |
| :--- | :--- |
| Route ký token lộ khi chạy `--host` | Chỉ loopback + Host local; chỉ khi `vite serve`; identity chỉ tin issuer này ở cụm dev |
| Server bỏ `response` khi hàng gửi đầy | Timeout 10s; gửi lại cùng `cid`, server khử trùng 15 phút |
| `SendMessage`/`MarkRead` cùng phòng chạy lần lượt; một lệnh `UNAVAILABLE` làm hỏng lệnh sau | UI (P3) gửi lại theo đúng thứ tự |
