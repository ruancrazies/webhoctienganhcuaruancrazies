-- 0018_login_scenes.sql — Scene đăng nhập theo mùa (giai đoạn 1) + nhật ký thao tác của admin.
--
-- Preset (màu, hình, nhân vật) là MÃ trong src/features/login-scene/scenes/<key>/; DB chỉ lưu lịch và tuỳ chọn:
--   login_scenes           mỗi scene một dòng cấu hình (câu chào, xuất bản/nháp, ghim, bật hiệu ứng canvas)
--   login_scene_schedules  các khoảng ngày được tự bật, theo giờ Việt Nam (mỗi năm admin tự đặt; Tết/Trung thu không tự tính)
--   admin_audit            ai, làm gì, lúc nào, trước/sau (dùng chung cho các trang quản trị sau này)
-- Chỉ service_role truy cập (như các bảng ghi khác): trình duyệt không đọc/ghi trực tiếp được.

create table public.login_scenes (
  key            text primary key check (key ~ '^[a-z][a-z0-9-]{1,23}$'),
  greeting       text check (greeting is null or char_length(greeting) between 1 and 80), -- null = dùng câu chào mặc định trong code
  status         text not null default 'draft' check (status in ('draft', 'published')),
  pinned         boolean not null default false,
  motion_enabled boolean not null default true,
  updated_at     timestamptz not null default now()
);
-- Tối đa MỘT scene được ghim ("dùng ngay") tại một thời điểm.
create unique index login_scenes_one_pinned on public.login_scenes (pinned) where pinned;

create table public.login_scene_schedules (
  id        bigint generated always as identity primary key,
  scene_key text not null references public.login_scenes (key) on delete cascade,
  starts_on date not null,                       -- ngày bắt đầu (bao gồm), giờ VN
  ends_on   date not null,                       -- ngày kết thúc (bao gồm), giờ VN
  priority  int  not null default 0 check (priority between 0 and 100), -- trùng lịch: số lớn thắng
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (ends_on - starts_on <= 120)             -- chặn gõ nhầm năm: một lịch tối đa ~4 tháng
);
create index login_scene_schedules_range_idx on public.login_scene_schedules (starts_on, ends_on);
create index login_scene_schedules_scene_idx on public.login_scene_schedules (scene_key);

create table public.admin_audit (
  id        bigint generated always as identity primary key,
  admin_id  uuid references public.profiles (id) on delete set null,
  action    text not null check (char_length(action) between 1 and 64),
  target    text not null check (char_length(target) between 1 and 128),
  before    jsonb,
  after     jsonb,
  at        timestamptz not null default now()
);
create index admin_audit_at_idx on public.admin_audit (at desc);

alter table public.login_scenes          enable row level security;
alter table public.login_scene_schedules enable row level security;
alter table public.admin_audit           enable row level security;
revoke all on public.login_scenes, public.login_scene_schedules, public.admin_audit from anon, authenticated;
grant  all on public.login_scenes, public.login_scene_schedules, public.admin_audit to service_role;
grant  usage on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------
-- Ghim / bỏ ghim một scene, nguyên tử (một giao dịch, không có khoảnh khắc hai scene cùng ghim).
-- p_key null = bỏ ghim tất cả. Ghim một scene chưa có dòng thì tạo dòng và đặt 'published' (ghim = dùng ngay).
-- ---------------------------------------------------------------------
create or replace function public.login_scene_set_pin(p_key text) returns void
language plpgsql set search_path = public as $$
begin
  if p_key is null then
    update login_scenes set pinned = false, updated_at = now() where pinned;
    return;
  end if;
  insert into login_scenes (key, status) values (p_key, 'published')
  on conflict (key) do nothing;
  -- Hai câu lệnh (cùng một giao dịch): bỏ ghim cái cũ TRƯỚC, vì chỉ mục duy nhất kiểm từng dòng ngay khi ghi.
  update login_scenes set pinned = false, updated_at = now() where pinned and key <> p_key;
  update login_scenes set pinned = true, status = 'published', updated_at = now() where key = p_key;
end $$;
revoke all on function public.login_scene_set_pin(text) from public;
grant execute on function public.login_scene_set_pin(text) to service_role;
