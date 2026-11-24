# Tóm tắt Kế hoạch Triển khai: Phase 2 — SDK Core Protocol & Transport (`packages/sdk`)

**Mã tài liệu:** `261124-sdk-protocol-p2-summary`  
**Ngày lập:** 2026-11-24  
**Trạng thái:** Đã Hoàn thành (Actual Build) — đính chính 2026-11-24, xem mục 7  
**Phạm vi:** Phase 2 trong chuỗi phát triển `chatim-web`.

---

## 1. Mục tiêu (Goal)

Xây dựng hoàn chỉnh gói thư viện `packages/sdk` thuần TypeScript (không phụ thuộc React hay DOM), triển khai trọn vẹn hợp đồng giao thức phía client với backend `chatim`: WebSocket state machine nhị phân protobuf `chatim.v1` (theo Module 09 §11), HTTP Gateway client (`fetch`), quản lý vòng đời token (đổi token Ed25519 tại `POST /v1/token` và tự gia hạn ngầm), cơ chế reconnect backoff theo mã đóng, gom lô danh bạ `DirectoryService`, và facade `ChatimClient`. Toàn bộ logic được kiểm thử 100% bằng Vitest với fake timers và fake socket.

---

## 2. Phạm vi Công việc (Scope)

### Trong phạm vi (In-Scope)
1. **Quản lý Token (`packages/sdk/src/auth/token.ts`):**
   * Đổi JWT của tenant lấy token chat Ed25519 (TTL 300s) qua `POST /v1/token` (RFC 8693).
   * Lên lịch tự gia hạn ngầm tại điểm ngẫu nhiên trong dải `70% – 85%` của `exp - iat` (không tin đồng hồ máy client).
   * Đổi token lỗi (mọi mã khác 2xx) thì ném lỗi; chưa xử lý riêng `429`/`503` `Retry-After` (mục 7).
2. **WebSocket State Machine (`packages/sdk/src/transport/ws.ts`):**
   * Kết nối tới `/ws` với subprotocol `chatim.v1`, chỉ truyền nhận frame nhị phân protobuf (`ClientFrame` / `ServerFrame`).
   * Quản lý 2 trạng thái nghiêm ngặt: *Chờ đăng nhập* và *Đang chạy*.
   * Gửi `AuthFrame{token}` sau handshake, nhận `ReadyFrame{}`.
   * Quản lý Heartbeat: Gửi `HeartbeatFrame{}` mỗi 8s (trước ngưỡng timeout 15s của server).
   * Giải mã mọi `ServerFrame` và chuyển nguyên cho `onFrame`; tự xử lý `ready` (sang *Đang chạy*) và `retry_later` (chờ đúng ms rồi gửi lại `auth`). Chưa khớp `response` theo `request_id`, chưa xử lý `load_failed` (mục 7).
   * Gửi lệnh realtime qua WebSocket: `SendMessage`, `open_room`, `close_room`, `watch_presence`, `typing`. Frame gửi khi socket chưa mở bị bỏ không báo lỗi; chưa cắt 200 ID, chưa giãn typing 3s (mục 7).
3. **Cơ chế Nối lại & Backoff (`packages/sdk/src/transport/retry.ts`):**
   * Triển khai bảng quy tắc backoff theo mã đóng WebSocket:
     * `1001` (server restart): ngẫu nhiên 0–60s.
     * `1000`, `1006`, mất mạng: ngẫu nhiên 0–3s.
     * `4009` (quá 10 kết nối/user/node): chờ 30–60s.
     * `4001` (quá 3 phút không auth): đổi token mới trước rồi mới nối lại.
     * `4003` (tenant bị khoá): dừng kết nối vĩnh viễn, báo lỗi tới ứng dụng.
     * Bắt tay lỗi, 503, 1002, 1011, 1013: exponential backoff 1s, 2s, 4s... tối đa 60s.
4. **Client HTTP Gateway (`packages/sdk/src/transport/http.ts`):**
   * Sử dụng Web Standard `fetch`, tự động gắn header `Authorization: Bearer <token>`.
   * Thực thi các lệnh đọc và quản lý room: `ListMyRooms`, `GetHistory`, `CreateRoom`, `OpenDirectRoom`, `GetClientConfig`.
5. **Gom lô Danh bạ RAM (`packages/sdk/src/directory/batcher.ts`):**
   * Cơ chế batching cho `DirectoryService/GetUsers`: Tự động gộp các user ID yêu cầu trong cùng một event loop tick thành 1 request (tối đa 100 ID/lần theo giới hạn server).
   * Gọi `GetMyProfile` đọc profile của chính mình từ RAM.
6. **ChatimClient Facade (`packages/sdk/src/client.ts` & `src/index.ts`):**
   * Lớp điều phối trung tâm: Khởi tạo, mở/đóng kết nối, đăng ký `onFrame` (mọi `ServerFrame`) và `onStatusChange`.
7. **Kiểm thử Toàn diện:**
   * Viết fake WebSocket trong bộ test để giả lập toàn bộ hành vi server mà không cần chạy backend Go.

### Ngoài phạm vi (Out-of-Scope)
* Chưa đụng tới giao diện React (`apps/web`), UI sẽ được triển khai ở Phase 3.
* Chưa hỗ trợ cắt phần upload file S3 multipart (dành riêng cho Phase 5: Media).
* Chưa làm Playwright E2E.

---

## 3. Sản phẩm Bàn giao (Deliverables)

| Sản phẩm | Vị trí | Tiêu chuẩn bàn giao |
| :--- | :--- | :--- |
| **Token Manager** | `packages/sdk/src/auth/` | Đổi token RFC 8693 và tự gia hạn ngầm ở 70–85% TTL. |
| **WebSocket Client** | `packages/sdk/src/transport/ws.ts` | State machine nhị phân protobuf 2 trạng thái, heartbeat 8s, parse 10 loại frame. |
| **Retry & Backoff** | `packages/sdk/src/transport/retry.ts` | Khớp 100% bảng mã đóng trong Module 09 §11.4. |
| **Gateway Client** | `packages/sdk/src/transport/http.ts` | Thực hiện các lệnh đọc/quản lý room qua HTTP POST JSON chuẩn. |
| **Directory Batcher** | `packages/sdk/src/directory/` | Gom lô tối đa 100 user ID / request `GetUsers`. |
| **Client Facade** | `packages/sdk/src/client.ts` | API công khai cho consumer với event listener typed. |
| **Test Suites** | `packages/sdk/test/` | 100% tests PASS trên Vitest (fake socket, fake timers). |

---

## 4. Tiêu chí Chấp nhận (Acceptance Criteria)

1. **Tuân thủ Hợp đồng WebSocket (Module 09 §11):**
   * Subprotocol `chatim.v1`, frame gửi/nhận là nhị phân protobuf (`ClientFrame` / `ServerFrame`).
   * Chuyển trạng thái sang "Đang chạy" sau khi nhận `ready`.
   * Phát `heartbeat` đều đặn mỗi 8s (validator kiểm < 15s timeout của server). Client chưa tự phát hiện server im lặng quá 15s (mục 7).
   * Tự gia hạn token khi chạm mốc 70–85% TTL bằng cách gửi `AuthFrame{token}` trên kết nối đang mở mà không ngắt socket.
   * Xử lý đúng `retry_later` (chờ đúng ms rồi auth lại) và `resync` (phát sự kiện yêu cầu nạp lại qua HTTP).
   * Áp dụng đúng thời gian backoff cho từng mã đóng (`1001`, `1000`, `1006`, `4009`, `4001`, `4003`).
2. **Tuân thủ Quy tắc Gateway & Identity:**
   * Gateway: Gửi Bearer token, gọi đúng endpoint Connect/JSON của Gateway.
   * Identity: `POST /v1/token` chuẩn RFC 8693; gom lô `GetUsers` không vượt quá 100 ID/lần.
3. **Quy chuẩn Kỹ thuật:**
   * Không có comment giải thích trong source code theo yêu cầu của Owner.
   * `pnpm lint` (Biome) không lỗi.
   * `pnpm test` chạy qua 100% test suites của SDK.
   * `pnpm build` build thành công dist library.

---

## 5. Căn cứ & Tài liệu Tham chiếu (Evidence Sources)

* Đặc tả Client Module 09: `chatim/docs/features/09-feature-realtime-delivery-and-ephemeral.md` §11.
* Đặc tả Gateway: `chatim/docs/apps/gateway.md` và `docs/features/11-feature-https-gateway.md`.
* Đặc tả Identity: `chatim/docs/apps/identity.md`.
* Proto WebSocket: `packages/sdk/src/gen/chatim/v1/ws_pb.ts`.
* Nguyên tắc an toàn vận hành: `.memory/ops-setup-hard-to-get-wrong.md`.

---

## 6. Rủi ro & Biện pháp Xử lý (Risks & Mitigations)

| Rủi ro | Mức độ | Biện pháp xử lý |
| :--- | :---: | :--- |
| **Rò rỉ Timer/Interval khi ngắt kết nối** | Cao | Tất cả timers (heartbeat, renew, backoff) được quản lý tập trung và dọn dẹp sạch sẽ (`clearTimeout`/`clearInterval`) trong hàm `close()`. |
| **Xung đột token khi đang gia hạn ngầm** | Trung bình | Khóa luồng gia hạn bằng Promise dùng chung (in-flight deduplication) để nhiều request đồng thời không gọi trùng `POST /v1/token`. |


---

## 7. Đính chính so với code thực tế (đối chiếu 2026-11-24)

Bản trước của tóm tắt này ghi một số luật là đã có, nhưng code P2 chưa làm. Đối chiếu với spec server `chatim` (`docs/features/09-feature-realtime-delivery-and-ephemeral.md` §11):

| Luật client | Code P2 | Chuyển đi đâu |
| :--- | :--- | :--- |
| Khớp `response{id}` của `SendMessage`, timeout lệnh | chưa có; `sendMessage()` trả `void` | P3a |
| Frame gửi khi socket chưa chạy | bị bỏ, không báo lỗi | P3a (reject ngay) |
| Gửi lại `open_room` + `watch_presence` sau mọi `ready` | chưa có | P3a |
| `load_failed` → `load_rooms` sau `retry_after_ms` | chưa có | P3a |
| `MarkRead` giãn 1 lần/giây/phòng | chưa có | P3a |
| Cắt `watch_presence` 200 ID | chưa có | P3a (SDK); giãn typing 3s ở web (P3) |
| `429`/`503` `Retry-After` khi đổi token | chưa có | chưa xếp phase |
| Tự phát hiện server im lặng > 15s | chưa có, spec không bắt buộc | chưa xếp phase |

Chi tiết P3a: `docs/plans/261124-sdk-fixes-p3a-summary.md`.
