-- 0017_profile_role.sql — vai trò quản trị (giai đoạn 0). Chỉ hai vai trò: 'user' (mặc định) và 'admin'.
--
-- Không có API nào cho phép tự nâng quyền: authenticated chỉ có SELECT trên profiles (xem 0002_rls.sql, không có
-- grant UPDATE/INSERT), mọi ghi đi qua server bằng service_role và không có hàm nào ghi cột này.
-- Cấp quyền admin bằng SQL thủ công (SQL editor của Supabase), ví dụ:
--   update public.profiles set role = 'admin' where id = '<uuid người dùng>';
alter table public.profiles
  add column if not exists role text not null default 'user' check (role in ('user', 'admin'));

-- Trang quản trị chỉ cần tra role theo id (khóa chính), không cần chỉ mục riêng.
