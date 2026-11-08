# Giai đoạn 3 — Sự kiện + hạn dùng

## Đã làm gì

**Dữ liệu** (`supabase/migrations/0020_seasonal_events.sql`)
- `seasonal_events` (một dòng = một **lần chạy**: `giang-sinh-2026`, `giang-sinh-2027` là hai dòng), `event_tasks` (nhiệm vụ + thưởng XP và/hoặc một cosmetic), `event_progress` (tiến độ + đã nhận). RLS bật, chỉ `service_role`.
- `bump_event_progress`: cộng tiến độ (cùng delta với nhiệm vụ ngày) cho sự kiện **đã xuất bản và đang diễn ra**; tính lại nhiệm vụ `all`.
- `claim_event_task`: một giao dịch (khóa → kiểm → đánh dấu nhận → cộng XP → `grant_cosmetic`). Món không cấp được thì hoàn tác tất cả.
- `event_duplicate` (nhân bản sang đợt mới, nguyên tử), `event_stats` (thống kê cho admin).
- **Bất biến do DB giữ** (không chỉ ứng dụng): đã xuất bản thì không sửa nhiệm vụ; đã có người có tiến độ thì không đưa về nháp, không xóa; `target` của nhiệm vụ `all` luôn bằng số nhiệm vụ khác.

**Vòng đời một đợt**: nháp → sắp diễn ra → đang diễn ra → còn nhận thưởng (`claim_days`, mặc định 2) → kết thúc. Tiến độ chỉ tăng khi *đang diễn ra*; nhận thưởng được cả lúc *còn nhận thưởng*.

**Hạn dùng và nhận lại** (dùng lại `grant_cosmetic` của giai đoạn 2, đã có test): món có `duration_days` thì `expires_at = ngày nhận + N ngày`; hết hạn thì `resolveLook` tự đưa về mặc định, món vẫn nằm trong Bộ sưu tập. Chạy lại sự kiện (đợt mới) → nhận lại → hạn tính lại từ ngày nhận, không cộng dồn, báo lại mở khóa. Đang còn món mà nhận nữa thì không gia hạn (giao diện nói rõ).

**Logic** `src/core/seasonEvents.ts` (thuần, có test): giai đoạn, ngày giờ VN ↔ thời điểm, đếm ngược, `buildTaskViews`, `publishCheck`, `checkEventEdit`, `canDo`. (Tên khác `core/events.ts`, vốn là sự kiện phân tích.)

**Server**: `repo/seasonEvents.ts`, `services/seasonEvents.ts` (`getMyEvents`, `claimEventTask`, `recordEventProgress`, `listAdminEvents`, `getAdminEvent`). `recordQuestProgress` gọi thêm `recordEventProgress` (lỗi bên nào cũng không ném, không đụng luồng chấm/XP).

**Giao diện người chơi**
- Tab **Nhiệm vụ** có hai mục: *Hằng ngày* và *Sự kiện* (`/quests?tab=events`, chấm số phần thưởng nhận được). Level chỉ còn dải tóm tắt bấm vào mở `/profile`.
- Thẻ sự kiện: đếm ngược, ngày cuối, nhiệm vụ, **phần thưởng ghi bằng chữ** (+XP, loại món, bậc hiếm, số ngày) kèm hình khung/avatar, nút Nhận thưởng, báo kết quả ngay (không để thú cưng nhắc lặp).
- Bộ sưu tập: món nhận qua sự kiện ghi “Nhận trong sự kiện “<tên>”” và có liên kết tới sự kiện đang chạy.

**Quản trị** `/admin/events` (danh sách + tạo), `/admin/events/<mã>`: kiểm tra trước khi xuất bản, xuất bản / đưa về nháp / kết thúc sớm / xóa nháp, sửa lịch (theo giai đoạn), thêm/xóa nhiệm vụ (chỉ nháp), **xem trước đúng thứ người chơi thấy**, nhân bản. Mọi action: `requireAdminId` → giới hạn tốc độ → zod → ghi `admin_audit`.

**Khung avatar**: hai khung **mẫu** `candy-cane` (hiếm, 30 ngày) và `snow-ring` (sử thi, vĩnh viễn), `active: false`. Ảnh do mã vẽ để thử luồng, **không phải tranh của họa sĩ**.

## Triển khai

1. Áp migration `0020_seasonal_events.sql`.
2. `npm run cosmetics:sync -- --dry-run`, rồi chạy thật (để món thưởng có trong bảng `cosmetics`; thiếu bước này admin không xuất bản được vì `publishCheck` chặn).
3. Deploy ứng dụng. (Thứ tự quan trọng: deploy trước khi có migration thì mỗi vòng học sẽ ghi log lỗi sự kiện — không hỏng vòng chơi, nhưng trang Nhiệm vụ sẽ lỗi.)

## Chạy thử trọn vòng đời trên máy thử

1. Đặt hai khung mẫu `active: true` (hoặc dùng khung thật của họa sĩ), chạy `cosmetics:sync`. Trong DB, đổi `unlock` của chúng thành `{"type":"event","event":"<mã đợt>"}` nếu dùng mã khác `giang-sinh-2026`.
2. `/admin/events` → tạo đợt (lịch bao gồm hôm nay) → thêm nhiệm vụ (vd “Chơi một trò chơi” thưởng `candy-cane`, “Hoàn thành tất cả” thưởng `snow-ring`) → xuất bản.
3. Chơi một vòng → `/quests?tab=events` thấy tiến độ → **Nhận thưởng** → khung vào Bộ sưu tập, dùng được.
4. Mô phỏng hết hạn: `update user_cosmetics set expires_at = now() - interval '1 day' where cosmetic_id = 'candy-cane';` → tự về không khung, Bộ sưu tập ghi “Hết hạn dd/mm”.
5. Admin **nhân bản** đợt sang đợt mới → xuất bản → làm lại và nhận lại → hạn tính lại 30 ngày.

(Bước 3–5 đã được test tự động ở tầng DB: `tests/db/seasonal-events.test.ts`, mục “vòng đời trọn vẹn”.)

## Khác với bản kế hoạch (có chủ ý)

1. **Thời gian nhận thưởng sau khi hết giờ** (`claim_days`, 0–14, mặc định 2): kế hoạch chưa nói, nhưng không có thì ai xong nhiệm vụ sát giờ sẽ mất thưởng.
2. **Nhiệm vụ “hoàn thành tất cả”** (`all`) làm “chuỗi nhiệm vụ” cho khung lớn: dùng lại đúng cách `all` của nhiệm vụ ngày. Chưa có chuỗi *tuần tự* (mở khóa bước sau khi xong bước trước).
3. **Mỗi lần chạy là một dòng riêng** thay vì sự kiện lặp lại theo năm; chạy lại = nhân bản. Đơn giản hơn và giữ nguyên tiến độ từng năm.
4. **Đã xuất bản thì khóa nhiệm vụ** (muốn đổi: nhân bản). Tránh đổi luật khi người chơi đang làm.
5. `app.css` cũ còn trong gói zip bạn gửi (docs giai đoạn 1 ghi là đã xóa) làm 3 test `no-raw-colors` đỏ: đã xóa.

## Giới hạn đã biết

- Đếm ngược tính lúc server dựng trang, không tự nhảy giây; vào lại trang là cập nhật.
- Thú cưng chưa báo “sự kiện mới bắt đầu” / “sắp kết thúc”; chỉ có chấm số trên mục Sự kiện.
- Chưa có sự kiện nào được tạo sẵn: admin tạo ở `/admin/events`.
- E2E (Playwright) cho luồng sự kiện chưa viết/chạy (cần Supabase thật). Đã chạy `next build` biên dịch thành công với env giả; kiểu của thư mục `content/` thiếu trong gói nên bước type-check của build không qua được ở đây (có từ trước).
- 8 file test (`content/*`, `exam`, `levels`, `passages`, `sync`) đỏ **trong gói đã gửi** vì thiếu thư mục `content/schema`; không liên quan giai đoạn 3.

## Kiểm thử

910 test qua (thêm khoảng 120): DB migration (23), lõi thuần (30, kể cả chạy với múi giờ máy khác VN), service (22), action admin (21), schema (29), cổng ảnh avatar/khung. `tsc` (ngoài lỗi `content/`) và `eslint` sạch.
