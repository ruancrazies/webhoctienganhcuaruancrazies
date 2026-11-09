-- 0021_profile_accent.sql — Màu nhấn do người dùng chọn (giai đoạn 4).
--
-- profiles.accent  mã màu nhấn (src/cosmetics/core/accents.ts), null = dùng màu nhấn riêng của theme.
-- Chỉ lưu MÃ; màu thật nằm trong code và đã được kiểm tương phản trên mọi theme. Mã lạ (đã bị xóa khỏi code) → ứng dụng bỏ qua.
-- Ghi qua server (service_role) như các cột hồ sơ khác; trình duyệt không ghi được.
alter table public.profiles
  add column if not exists accent text check (accent is null or accent ~ '^[a-z][a-z0-9-]{1,23}$');
