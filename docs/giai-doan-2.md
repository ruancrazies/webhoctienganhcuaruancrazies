# Giai đoạn 2 — Theme + avatar theo level

## Đã làm gì

**Dữ liệu** (`supabase/migrations/0019_cosmetics.sql`)
- `profiles.theme` (id theme hoặc `'auto'`) và `profiles.frame`.
- Bảng `cosmetics` (danh mục, sửa được từ DB) và `user_cosmetics` (món người dùng đang sở hữu, có hạn dùng).
- Hàm `grant_cosmetic` (tặng món, không gia hạn khi còn hạn) và `sync_level_cosmetics` (cấp món theo level, chỉ thêm, không bao giờ thu hồi).
- RLS bật, chỉ `service_role` đọc/ghi.

**Logic** (`src/core/cosmetics.ts`, thuần, có test): gộp manifest với DB, trạng thái từng món (đang có / hết hạn / khóa / đóng), `resolveLook` (món hết hạn hoặc không sở hữu tự quay về mặc định), thông báo cần báo.

**Server**: `repo/cosmetics.ts`, `services/cosmetics.ts` (`getMyLook`, `getCollection`, `equipCosmetic`, `pollCosmetics`), `equipCosmeticAction` và `pollCosmeticsAction`. Có giới hạn tần suất.

**Theme**: một trục duy nhất; Tối là một theme như các theme khác, "Vở ô ly" là mặc định. Thêm 3 theme khởi đầu: *Rừng đêm* (Lv10), *Kẹo ngọt* (Lv15), *Hoàng hôn tím* (Lv20). Cả ba đều qua cổng tương phản (chữ 4.5:1, UI 3:1). Cookie `eg-theme` chỉ là bản để vẽ nhanh, tài khoản mới là nguồn chính, nên đổi ở máy này thì máy khác theo.

**Giao diện**
- `/profile` gọn lại (danh tính, level, 3 số liệu, 3 thẻ liên kết).
- `/profile/collection`: tab Giao diện / Avatar / Khung, bộ lọc, trạng thái khóa kèm thanh tiến độ ("Cần Level 15 — còn 340 XP"), hạn dùng bằng chữ, nút **Dùng thử** (đổi cả trang, chưa lưu, có thanh "Thôi, quay lại").
- `/profile/settings`: đổi tên, tự động theo thiết bị, tắt tiếng, thú cưng, đăng xuất.
- Avatar có khung hiện ở bảng xếp hạng (chỉ khi khung còn hạn).

**Thông báo qua thú cưng** (`CosmeticWatcher`): hỏi server tối đa 1 phút/lần khi vào app, đổi trang hoặc quay lại tab. Báo mở khóa đúng một lần, báo sắp hết hạn (≤7 ngày, ≤1 ngày) và đã hết hạn. Hai tab không báo trùng. Thú cưng tắt thì không đánh dấu "đã báo", món vẫn có nhãn "Mới".

**Công cụ**: `npm run cosmetics:sync` đẩy manifest vào DB (`--dry-run`, `--target`, `--yes`). Chỉ thêm món mới và cập nhật tên/độ hiếm; không ghi đè phần admin đã sửa.

## Triển khai

1. Áp migration `0019_cosmetics.sql` lên Supabase.
2. `npm run cosmetics:sync -- --dry-run`, xem kết quả rồi chạy lại không có `--dry-run`.
3. Deploy ứng dụng. Người dùng cũ chưa có `profiles.theme` sẽ được nhận theme từ cookie trên máy họ.

Thứ tự này quan trọng: nếu deploy trước khi có migration, trang Tôi và layout sẽ lỗi.

## Chỉnh sửa bằng SQL (admin)

Điều kiện mở khóa, thời hạn, bật/tắt nằm ở bảng `cosmetics` (`unlock`, `duration_days`, `active`, `available_from/until`). Ví dụ đổi Rừng đêm xuống Level 8:

```sql
update cosmetics set unlock = '{"type":"level","level":8}' where id = 'forest';
```

Không đổi `unlock` của món loại `default`: người dùng mới sẽ mất món đó. Người đã có món thì vẫn giữ (sync không thu hồi).

## Chuyển avatar emoji → avatar minh họa (làm sau)

Hiện avatar emoji cũ vẫn hiển thị bình thường (`legacyAvatar`), và `AvatarPicker` còn nằm trong `/profile/settings` như phần chuyển tiếp. Khi họa sĩ giao 4–6 avatar mặc định:

1. Thêm avatar vào manifest, chạy `cosmetics:sync`.
2. `update profiles set avatar = null;` một lần.
3. Xóa `AvatarPicker`, `updateAvatarAction`, `core/avatars.ts`.

Đến lúc đó tab Avatar mới có nội dung (hiện đang trống, có dòng giải thích).

## Giới hạn đã biết

- Cấp món theo level là "lười": chạy khi người dùng vào app. Thông báo mở khóa hiện ở lần hỏi kế tiếp, tối đa khoảng 60 giây sau khi lên level.
- Người tắt thú cưng không nghe được thông báo, chỉ thấy nhãn "Mới" và chip "N món mới".
- Ba theme khởi đầu cần xem lại bằng mắt ở `/admin/gallery` trước khi mở cho người dùng thật.

## Kiểm thử

890 test qua (tăng thêm khoảng 90: DB migration, sync, logic thuần, service, action). `tsc` và `eslint` sạch. Đã chụp ảnh và chạy axe cho 5 theme ở 375px và 1024px: không lỗi tương phản, không tràn ngang.
