# Tóm tắt Kế hoạch: Phase 3a — Vá SDK & Đăng nhập dev thật

**Mã tài liệu:** `261124-sdk-fixes-p3a-summary`  
**Ngày lập:** 2026-11-24  
**Trạng thái:** Chờ Duyệt (Draft)  
**Vị trí:** chèn giữa P3 Task 4 (đã xong) và P3 Task 5–8. P3 Task 5–8 chỉ bắt đầu khi P3a xong.

---

## 1. Câu chuyện (giá trị mẫu; id là chuỗi Base62 11 ký tự như server cấp)

1. **Chuẩn bị, một lệnh:** cụm `chatim` local đang chạy. Dev gõ `pnpm dev:issuer`: tạo khoá ES256 `kid: web-dev-1` trong `.local/dev-issuer/`, đăng ký tenant `dev`, issuer `chatim-web-dev` và khoá công khai ở identity. Gõ lại lần nữa: không đổi gì, không lỗi.
2. **Đăng nhập:** Lan mở `http://localhost:3000`, bấm "Lan". App gọi `GET /__dev/subject-token?user=lan`; middleware của Vite ký JWT `{iss: "chatim-web-dev", sub: "lan", aud: "chatim", exp: iat + 300}`. SDK đổi tại `POST /v1/token`, nhận token chat có `sub: "409BKeLbOoM"`, sống 300s. `client.myUserId` = `"409BKeLbOoM"`. Tab thứ hai bấm "Alice" chạy song song.
3. **Gửi tin:** `sendMessage("3cSuFSuZYdY", "Lô hàng sáng nay", cid)` gửi request id `7`. Server trả `response{id: 7, code: 0, seq: 144}` → Promise trả `{seq: 144}`.
   - Socket đang nối lại → Promise bị từ chối ngay, lý do `not_connected`.
   - Đang chờ thì socket đóng → từ chối `connection_lost` (không biết server đã lưu chưa; gửi lại cùng `cid` thì server khử trùng trong 15 phút).
   - 10s không có trả lời → từ chối `timeout`.
4. **Nối lại:** server restart (mã đóng 1001), SDK chờ 0–60s rồi nối lại, nhận `ready`. SDK tự gửi lại `open_room 3cSuFSuZYdY` và `watch_presence ["7hQx2LmPa0Z"]` mà app không cần làm gì. Nhận `resync` trên kết nối đang chạy thì không gửi lại gì.
5. **Server nạp phòng lỗi:** nhận `load_failed{retry_after_ms: 2000}` → sau 2000ms cộng một khoảng ngẫu nhiên, SDK gửi `load_rooms` → nhận `ready`.
6. **Đánh dấu đã đọc:** Lan xem tới seq 144 → `markRead("3cSuFSuZYdY", 144)` gửi ngay. 0,3s sau thấy 145 rồi 146 → chờ, đủ 1s thì gửi một lệnh với 146. Ngay sau đó app gọi `listMyRooms()`: SDK chờ lệnh `MarkRead` đang bay trả lời rồi mới gọi, nên Kho HCM về unread 0 và giữ 0.

---

## 2. Mục tiêu

Chạy được với server `chatim` thật: đăng nhập dev bằng nút bấm, và SDK làm đủ 5 luật client của §11 mà P2 còn thiếu, mỗi luật có unit test.

---

## 3. Phạm vi

### Trong phạm vi
1. **Hợp đồng server vào `docs/` (làm trước khi code):** `docs/chatim-client-contract.md` chép đúng các luật P3a và P3 dùng: đổi token, id Base62, lệnh WebSocket + `response`, `ready`/`resync`/`load_failed`, `open_room`, presence, typing, `MarkRead`, unread trong `ListMyRooms`, CORS dev.
2. **Đăng nhập dev qua dev issuer (`apps/web`, chỉ chế độ dev):**
   - `pnpm dev:issuer`: một lệnh, chạy lại an toàn. Sinh khoá ES256 bằng `crypto` của Node (không cần image `chatcli`), đăng ký qua `docker exec chatim-identity-1 /app tenant-create | issuer-add | issuer-key-add` (cách `chatim` đang dùng: `Makefile:121`, `scripts/e2e-identity-exchange.sh:4–21`).
   - Plugin Vite chỉ chạy khi `vite serve`: route `/__dev/subject-token`, chỉ nhận request từ máy local, khoá riêng không vào bundle.
   - Nút Lan/Alice/Bob lấy token qua route này; bỏ token `alg: none`.
   - Cổng 3000 cố định (`strictPort`), khớp `APP_CORS_ORIGINS` của gateway và identity.
3. **SDK (`packages/sdk`):**
   - `myUserId` lấy từ `sub` của token chat.
   - `sendMessage()` trả Promise; khớp `response` theo id; từ chối khi chưa kết nối, khi mất kết nối, khi quá 10s.
   - Nhớ phòng đang mở và danh sách watch (thay toàn bộ, tối đa 200), gửi lại sau mọi `ready`.
   - `load_failed` → `load_rooms` sau `retry_after_ms` + khoảng ngẫu nhiên.
   - `markRead()` tối đa 1 lần/giây/phòng, gửi phần đang chờ trước `close_room`; `listMyRooms()` chờ các `MarkRead` đang bay.
   - Validator kiểm thêm: khoảng giãn `MarkRead` ≥ 1000ms, timeout lệnh > 0.

### Ngoài phạm vi
- Giao diện dùng các API mới (trạng thái gửi, nút Thử lại, `markRead` khi xem phòng): P3 Task 5–8.
- `MarkUnread`; xếp hàng lệnh khi mất kết nối; thử lại `429`/`503` khi đổi token; tự phát hiện server im lặng.
- Đăng nhập production.

---

## 4. Sản phẩm bàn giao

| Sản phẩm | Vị trí |
| :--- | :--- |
| Hợp đồng client | `docs/chatim-client-contract.md` |
| Lệnh dev issuer + plugin Vite | `scripts/`, `apps/web/vite.config.ts`, `apps/web/src/features/auth/` |
| Lệnh có trả lời, nhớ phòng/watch, `load_failed`, `markRead`, `myUserId` | `packages/sdk/src/` |
| Unit test cho từng luật | `packages/sdk/test/`, `apps/web/test/` |
| Cập nhật chỉ mục | `INDEXES.csv` |

---

## 5. Tiêu chí chấp nhận

1. `pnpm lint`, typecheck, `pnpm test`, `pnpm build` đều xanh.
2. Mỗi luật có test riêng (fake socket, fake timers):
   - `response` code 0 → trả seq; code khác 0 → từ chối kèm code; chưa kết nối, mất kết nối, quá 10s → từ chối đúng lý do.
   - Sau `ready` thứ hai: gửi lại đúng các phòng đang mở và danh sách watch; sau `resync`: không gửi gì.
   - `load_failed{2000}` → `load_rooms` gửi trong khoảng 2000ms + jitter; `close()` huỷ timer.
   - `markRead` 145 rồi 146 trong 1s → đúng 2 lệnh (gửi ngay, rồi 146); `close_room` gửi phần chờ trước.
   - Validator từ chối khoảng giãn `MarkRead` 500ms.
   - Middleware từ chối request không phải loopback; thiếu file khoá → báo "chạy `pnpm dev:issuer`".
3. **Với server thật:** chạy cụm `chatim`, rồi `pnpm dev:issuer`, rồi `pnpm dev`; tab 1 bấm "Lan", tab 2 bấm "Alice" → cả hai hết banner "Đang kết nối" (đã nhận `ready`).
4. `apps/web/dist` không chứa `__dev` hay khoá.

---

## 6. Căn cứ (repo `chatim`)

- `docs/features/09-feature-realtime-delivery-and-ephemeral.md`:
  - lệnh và `response`: :274–281
  - `open_room`: :317
  - `load_failed`: :331, :481, :498
  - presence: :380, :401
  - typing: :395
  - `ready`/`resync`: :476, :495–496
  - lệnh mất trả lời: :494, :532
  - `MarkRead`: :504
- `docs/apps/identity.md`:
  - đổi token: :62
  - hạn tối đa của token tenant: :23
  - lệnh admin issuer: :99–138
- `docs/apps/gateway.md:25`; `deploy/compose/docker-compose.yml:84, :410` (CORS `http://localhost:3000`).

---

## 7. Rủi ro

| Rủi ro | Xử lý |
| :--- | :--- |
| Route ký token lộ ra mạng LAN khi chạy `--host` | Chỉ nhận loopback; chỉ có khi `vite serve`; identity chỉ tin issuer này ở cụm dev |
| Server không trả lời khi hàng gửi đầy | Timeout 10s; gửi lại cùng `cid`, server khử trùng |
| Server xử lý `SendMessage`/`MarkRead` của cùng phòng **lần lượt**; một lệnh lỗi `UNAVAILABLE` làm hỏng các lệnh xếp sau | UI (P3) gửi lại theo đúng thứ tự cũ |
