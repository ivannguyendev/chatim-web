# Hợp đồng client với server `chatim`

Chép từ repo `chatim` tại commit `cb08e861` (2026-11-25); chỉ gồm luật P3a và P3 dùng. Server đổi luật thì cập nhật file này trước khi sửa code. **F09** = `docs/features/09-feature-realtime-delivery-and-ephemeral.md`.

## 1. Định danh

- Room id, user id: chuỗi Base62 đúng 11 ký tự, phân biệt hoa thường (`3cSuFSuZYdY`, `409BKeLbOoM`); giữ nguyên chuỗi server trả (F09:444–445).
- User id của mình là `sub` của **token chat** do identity cấp; `sub` của token tenant (ví dụ `lan`) không bao giờ ra khỏi identity (`docs/apps/identity.md:62`).
- `cid` của tin nhắn: 1–64 ký tự `[A-Za-z0-9_-]`, sai thì `INVALID_ARGUMENT` (`pkg/ids/ident.go:11,16`).

## 2. Đổi token (identity)

- `POST /v1/token`, body `application/x-www-form-urlencoded`: `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`, `subject_token=<JWT tenant>`, `subject_token_type=urn:ietf:params:oauth:token-type:jwt`; token sai → `400 invalid_grant` (identity.md:62, :69).
- Token tenant phải đủ các điều kiện sau. Không có chế độ nhận token không ký (identity.md:23, :62; `apps/identity/internal/trust/verify.go`; `deploy/compose/docker-compose.yml:84`).
  - header có `kid`, không có `crit`;
  - `alg` là EdDSA, ES256 hoặc RS256, đúng khoá đã đăng ký;
  - `iss` đã đăng ký;
  - `aud` = `IDENTITY_EXCHANGE_AUDIENCE` (compose dev: `chatim`);
  - `exp − iat ≤ 10 phút`;
  - `sub` dài 1–255 byte, chỉ gồm byte 0x21–0x7E.
- Token chat sống 5 phút (`expires_in` 300). Gia hạn ở điểm ngẫu nhiên trong khoảng 70–85% thời hạn, tính từ lúc nhận token. Gửi `auth` trên socket đang mở và dùng token mới cho HTTPS (identity.md:21, :66; F09:493).

## 3. Đăng ký issuer dev

- Gọi lệnh admin: `docker exec chatim-identity-1 /app <lệnh>` (`Makefile:121–122`, `scripts/e2e-identity-exchange.sh:4–21`).
- `tenant-create -id -name`, `issuer-add -issuer -tenant`, `issuer-key-add -issuer -kid -alg ES256 -jwk '<JWK công khai có kid, alg, use>'`, `issuer-keys -issuer` (bảng `KID ALG STATE CREATED_AT`) (identity.md:103–142).
- Identity nạp lại issuer/khoá ngay khi đổi (change stream), lưới an toàn `IDENTITY_TRUST_RELOAD` = 10s (identity.md:24).

## 4. CORS dev

- Gateway và identity chỉ nhận trình duyệt từ `APP_CORS_ORIGINS`; compose dev đặt `http://localhost:3000`, không `*`, không cookie (gateway.md:25, :36; identity.md:31; `docs/features/11-feature-https-gateway.md:51`; compose :86, :412).

## 5. WebSocket

- Subprotocol `chatim.v1`; chỉ frame nhị phân protobuf `ClientFrame`/`ServerFrame`; frame > 128 KB → đóng 1009 (F09:439, :522).
- Gửi `heartbeat` mỗi 5–10 giây suốt đời kết nối, **ở cả hai trạng thái**; 15 giây không có frame → server đóng 1000 (F09:441).
- Nối lại theo mã đóng: 1001 → 0–60s; 1000/1006 → 0–3s; 4009 → 30–60s; 4001 → đổi token mới trước; 4003 → không tự nối. Không nối lại vì `auth_required`, `retry_later`, `frame_error` (F09:492).

## 6. Lệnh và trả lời

- `request{id, <lệnh>}` → `response{id, code, message, result}` cùng `id`; `id` do client đặt, server không kiểm trùng; `code` là mã gRPC, 0 = OK (F09:274).
- Chỉ 11 lệnh ghi realtime đi WebSocket (`SendMessage`, `MarkRead`, …); đọc và quản lý đi HTTPS (F09:275).
- `SendMessage`/`MarkRead`/`MarkUnread` cùng kết nối, cùng room chạy lần lượt; một `SendMessage` lỗi `UNAVAILABLE`/`DEADLINE_EXCEEDED`/`CANCELED` làm các lệnh chờ phía sau của room đó lỗi theo; client gửi lại theo đúng thứ tự (F09:281).
- `RESOURCE_EXHAUSTED`: chậm lại (50 frame/s, 32 lệnh đang bay) (F09:475, :520–521).
- Lệnh chưa có trả lời lúc rớt kết nối: không tự gửi lại, kết quả chưa rõ; gửi lại thì dùng cùng `cid` (chống trùng 15 phút) (F09:494).
- `response` có thể bị bỏ khi hàng gửi đầy → client tự quá hạn lệnh (F09:532).
- `msg_created` mang `cid`, tới mọi thành viên kể cả người gửi (`proto/chatim/v1/chat.proto:62`; `docs/events.md:90`).

## 7. Trạng thái kết nối

| Frame | Client làm gì | Nguồn |
|---|---|---|
| `ready` | Sau **mọi** `ready` (kết nối mới, hoặc sau `auth_required` trên cùng kết nối): gửi lại `open_room` các room đang xem và `watch_presence` đầy đủ, rồi tải lại `ListMyRooms` + `GetHistory` room đang xem | F09:476, :495 |
| `resync` khi đang chạy | Chỉ tải lại qua HTTPS; không gửi lại `open_room`/`watch_presence` | F09:479, :496 |
| `resync` trước `ready` | Coi như `ready` | F09:479, :495 |
| `load_failed{retry_after_ms}` | Kết nối giữ, user tạm ngừng (không event, không `ready`, lệnh vẫn chạy), server không tự nạp lại → gửi `load_rooms` sau `retry_after_ms` cộng jitter, hoặc nối lại | F09:331, :481, :498 |
| `retry_later{retry_after_ms}` | Chờ đúng `retry_after_ms` rồi gửi lại `auth` | F09:484 |
| `room_closed{room_id, reason}` | Đóng màn hình room | F09:480 |

## 8. Room đang mở

- `open_room` nhận thêm event mức room (react, ghim, số thành viên, vai trò, `read_positions` của người khác, typing). `msg_created`/`msg_edited`/`msg_deleted`/`room_updated` tới mọi thành viên dù room mở hay không (F09:317, :482; `docs/events.md:90–98`).
- `open_room` gửi trước `ready`, khi tạm ngừng hoặc sau `load_failed` bị bỏ qua, không trả lời. Không phải thành viên → `room_closed{NOT_MEMBER}` sau tối đa 10s. Không giới hạn số room mở. `close_room` luôn chạy, không trả lời (F09:317–319; `apps/websocket/internal/interest/conn.go:77–91`).

## 9. Presence

- `watch_presence{user_ids}` **thay toàn bộ** danh sách, tối đa 200 id (bỏ id sai dạng, id trùng) (F09:380, :401).
- Trả ngay một lần, sau đó gửi `presence` với **toàn bộ** danh sách mỗi lần client heartbeat; client thay trạng thái bằng frame mới nhất. Online hiện trong ~9s, offline sau 10–30s (F09:382, :401, :405, :483).
- Danh sách mất khi kết nối về chờ đăng nhập; `resync` giữ nguyên (F09:401, :479).

## 10. Typing

- Gửi `typing` tối đa 1 lần/3s mỗi room; `stopped` chỉ khi trước đó đã gửi `typing`; gửi tin là kết thúc gõ. Server giới hạn 2/s (burst 4) mỗi kết nối, vượt thì bỏ im lặng (F09:390–395, :505, :520).
- Bên nhận hiện khi nhận; tắt khi `stopped`, khi thấy `msg_created` của người đó trong room, hoặc sau **6 giây** không có tín hiệu. Chỉ tới kết nối đang mở room, không tới thiết bị của người gõ (F09:392–395, :482).

## 11. Unread và MarkRead

- Không có event unread. Unread lấy từ `ListMyRooms`/`GetRooms`: `unread{count, approx}`, tối đa 100 (hiện "99+") (`docs/architecture.md:90`; `docs/features/07-feature-read-receipts-and-unread-badge.md:94–104`).
- `MarkRead{room_id, seq}` qua WebSocket (F09:365–368, :504):
  - tối đa 1 lần/giây mỗi room: lần đầu của room đang yên gửi ngay, sau đó gửi seq lớn nhất đang chờ;
  - `MarkUnread` huỷ `MarkRead` đang chờ;
  - gửi phần đang chờ trước `close_room`;
  - chờ trả lời mọi `MarkRead` đang gửi rồi mới gọi `ListMyRooms`.

## 12. HTTPS

- Mọi lệnh: `POST` JSON, `Authorization: Bearer <token chat>`.
- `ListMyRooms`: `limit` 0 → 20, > 100 lỗi; trang tiếp qua `next`; `RoomItem` có `room`, `me`, `preview`, `unread`, `peer_read_seq`; room đã ghim lên đầu (ghim mới trước), còn lại xếp theo mốc mới hơn giữa tin mới nhất và lúc vào room, mới trước (`apps/chat/internal/api/grpcsrv/room_list.go`; `proto/chatim/v1/room_list.proto:15–60`; `apps/chat/internal/model/domain/room_order.go:37–63`).
- `GetHistory`: `limit` 0 → 50, 1–100; neo `LATEST`/`OLDEST`/`BEFORE`/`AFTER`/`AROUND` + `seq`; kết quả seq tăng dần (`docs/features/08-feature-history-retrieval-and-sync.md:136`; `proto/chatim/v1/chat.proto:22–29`; `apps/chat/internal/store/mongostore/page.go:43–45`).
- `GetUsers` (identity, `POST /chatim.identity.v1.DirectoryService/GetUsers`): 1–100 id; id sai dạng làm hỏng cả lệnh; id không có bị bỏ (identity.md:59, :80).
- `msg_created` có seq đã thấy → bỏ; nhảy seq → gọi `GetHistory` (F09:503).
