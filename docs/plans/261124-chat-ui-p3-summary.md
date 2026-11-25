# Tóm tắt Kế hoạch Triển khai: Phase 3 — App Shell, Auth & Core Chat UI (`apps/web`)

**Mã tài liệu:** `261124-chat-ui-p3-summary`  
**Ngày lập:** 2026-11-24 · **Sửa:** 2026-11-24 (sau khi đối chiếu spec server)  
**Trạng thái:** Chờ Duyệt (Draft)  
**Phụ thuộc:** Task 5–8 chỉ làm sau P3a (`docs/plans/261124-sdk-fixes-p3a-summary.md`).

---

## 1. Câu chuyện (giá trị mẫu; id là chuỗi Base62 11 ký tự như server cấp)

1. **Đăng nhập:** Lan mở `http://localhost:3000`, bấm "Lan" (đăng nhập dev, P3a). Token chat có `sub: "409BKeLbOoM"`; app dùng id này cho mọi phép so "là mình", không dùng chữ `lan`.
2. **Danh sách phòng:** sau `ready`, cột trái gọi `ListMyRooms` và hiện 3 phòng:
   - `# General` (`8Kp2mQzR4tA`)
   - `# Kho HCM` (`3cSuFSuZYdY`), unread 2, xem trước "Lô hàng sáng nay"
   - DM với Alice (`7hQx2LmPa0Z`): app gửi `watch_presence ["7hQx2LmPa0Z"]`, chấm xanh hiện trong khoảng 9s.
3. **Mở phòng:** Lan bấm Kho HCM, URL đổi thành `/chat/3cSuFSuZYdY`.
   - App gửi `open_room` và gọi `GetHistory(limit 50)`; hiện 25 tin kèm tên và avatar từ `GetUsers`.
   - App gửi `markRead(…, 143)`: badge về 0 và vẫn là 0 sau khi tải lại trang.
4. **Gõ và gửi:**
   - Lan gõ → `typing` tối đa 1 lần/3s. Tab Alice hiện "Lan đang gõ…", tắt khi nhận `stopped`, khi thấy tin của Lan, hoặc sau 6s.
   - Lan nhấn Enter → bubble "Đang gửi" → server trả seq 144 → "Đã gửi". Tab Alice thấy tin qua `msg_created`.
5. **Sự cố:**
   - Mất mạng lúc gửi → bubble "Lỗi · Thử lại". Bấm Thử lại gửi lại cùng `cid`, nên không ra tin trùng.
   - Nối lại → `ready` → app tải lại danh sách phòng và lịch sử phòng đang xem.
   - Lan bị xoá khỏi Kho HCM → `room_closed` → về `/chat`, kèm thông báo.

---

## 2. Mục tiêu

Ứng dụng chat dùng được với server thật cho luồng MVP:
- đăng nhập dev;
- App Shell 3 cột;
- danh sách phòng có unread đúng và presence;
- lịch sử và gửi tin văn bản có trạng thái gửi rõ ràng;
- báo đang gõ;
- tự phục hồi sau khi nối lại.

---

## 3. Phạm vi

### Trong phạm vi
1. **Đã xong (Task 1–4):** UI copy, `timers.ts`, router, mô hình dữ liệu và key cache, `AuthProvider`/`LoginScreen`, `ChatimProvider` vá cache realtime.
2. **Làm lại ở Task 1–4 sau P3a:**
   - `userId` của app lấy từ `await client.getMyUserId()` (key cache, so người gửi, tìm người đối diện trong DM).
   - `ChatimClientAdapter` khai `sendMessage(): Promise<SentMessage>` và thêm `markRead`, `getMyUserId` (hiện adapter bỏ Promise → lỗi thành unhandled rejection); thêm `<main>` cho shell.
   - `TYPING_EXPIRE_MS` = 6000.
   - Sau mỗi `ready`: tải lại danh sách phòng và lịch sử phòng đang xem.
   - `resync`: tải lại mọi lịch sử đang có trong cache.
   - `room_closed` → rời màn hình phòng.
   - `msg_created` nhảy seq → tải lại lịch sử phòng đó.
3. **Task 5 — Shell:** `AppShell` 3 cột, sidebar (người dùng, Đăng xuất, lọc phòng), `ContextDrawer` thu gọn.
4. **Task 6 — Phòng:** `RoomList`/`RoomItem`; badge unread lấy từ server (tối đa "99+"); presence cho DM; đồng bộ URL.
5. **Task 7 — Tin nhắn:**
   - Timeline, `MessageItem`, `TypingIndicator`.
   - `Composer` giãn typing 3s; gửi tin là kết thúc gõ, không gửi `stopped`.
   - Trạng thái gửi Đang gửi → Đã gửi / Lỗi · Thử lại (cùng `cid`).
   - `markRead` khi phòng đang hiển thị.
6. **Task 8 — Lắp ghép:** `App.tsx`, test walk-through, kiểm với server thật, `INDEXES.csv`.

### Ngoài phạm vi
- Upload file (P4).
- Thread, reaction, pin, mention (P5).
- Playwright E2E.
- Trang thứ hai của danh sách phòng (mặc định 20 phòng).
- Nạp tin cũ hơn khi cuộn lên.

---

## 4. Sản phẩm bàn giao

| Sản phẩm | Vị trí |
| :--- | :--- |
| Shell + Drawer | `apps/web/src/features/shell/` |
| Phòng + presence | `apps/web/src/features/rooms/` |
| Tin nhắn + composer + typing | `apps/web/src/features/messages/` |
| Lắp ghép app | `apps/web/src/app/App.tsx` |
| Test (Vitest + RTL) | `apps/web/test/` |

---

## 5. Tiêu chí chấp nhận

1. `pnpm lint`, typecheck, `pnpm test`, `pnpm build` đều xanh. Text giao diện chỉ lấy từ `ui-copy.ts`; test so đúng hằng số.
2. Test thành phần:
   - Phòng có tin của chính mình từ thiết bị khác (cùng `getMyUserId()`) → badge không tăng.
   - DM chọn đúng người đối diện.
   - Response lỗi → "Lỗi · Thử lại"; bấm Thử lại → gửi lại cùng `cid`.
   - Typing tắt sau 6s (fake timers).
   - `room_closed` → URL về `/chat`.
   - Sau `ready` thứ hai → danh sách phòng được tải lại.
3. Test walk-through `App`: đăng nhập → chọn phòng → URL → gửi tin → đăng xuất (cache bị xoá).
4. **Với server thật, 2 tab Lan và Alice:**
   - Lan gửi → Alice thấy trong ≤ 1s; bubble của Lan thành "Đã gửi".
   - Alice gõ → tab Lan hiện đang gõ, tự tắt ≤ 6s.
   - Alice nhắn khi Lan ở phòng khác → badge 1; Lan mở phòng → 0; tải lại trang → vẫn 0.
   - Tắt mạng rồi gửi → "Lỗi · Thử lại"; bật mạng, Thử lại → đúng 1 tin trên cả hai tab.

---

## 6. Căn cứ

- `docs/chatim-client-contract.md` (P3a chép từ repo `chatim`, `docs/features/09-feature-realtime-delivery-and-ephemeral.md` §11).
- `docs/features/07-feature-read-receipts-and-unread-badge.md` (unread tối đa 100, `approx`).
- Decision log: `.agent/plans/261124-chat-ui-design.md` (D-UI-01..05, có mục sửa đổi), `.claude/plans/261124-sdk-fixes-p3a-design.md`.

---

## 7. Rủi ro

| Rủi ro | Xử lý |
| :--- | :--- |
| Tin realtime đến trước hoặc trùng với kết quả `GetHistory` | Gộp theo `cid` và seq; tin chưa có seq đứng cuối |
| Rò rỉ timer typing hoặc subscription khi đổi phòng, đăng xuất | Dọn trong cleanup; test bằng fake timers |
| Badge tăng ở client (+1 khi có tin ở phòng khác) lệch số server | `ListMyRooms` là nguồn đúng; bị ghi đè khi tải lại |
| Đổi `userId` sang `getMyUserId()` làm vỡ key cache đã có | Key cache tạo sau khi đổi token xong; đăng xuất xoá toàn bộ cache |
