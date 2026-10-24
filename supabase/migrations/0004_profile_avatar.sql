-- 0004_profile_avatar.sql — avatar của người dùng: mã của một avatar có sẵn (xem src/core/avatars.ts).
-- null = chưa chọn, giao diện hiện chữ cái đầu của tên. Danh sách hợp lệ do ứng dụng kiểm tra.
alter table public.profiles
  add column if not exists avatar text check (avatar is null or char_length(avatar) <= 32);
