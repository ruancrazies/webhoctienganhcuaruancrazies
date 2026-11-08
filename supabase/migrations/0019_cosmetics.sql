-- 0019_cosmetics.sql — Cosmetic: theme, avatar, khung (giai đoạn 2).
--
-- Hình thật (token màu, ảnh) nằm trong CODE (src/cosmetics/*); DB chỉ điều khiển việc CẤP và HẠN:
--   profiles.theme / profiles.frame   mã đang dùng (profiles.avatar giữ nguyên). theme = mã theme hoặc 'auto'
--   cosmetics                         danh mục (đồng bộ từ manifest bằng `npm run cosmetics:sync`; phần admin chỉnh nằm ở đây)
--   user_cosmetics                    món người dùng ĐÃ CÓ, kèm hạn dùng. Đây là nguồn sự thật về quyền sở hữu: đổi công thức XP
--                                     sau này không làm ai mất món đã mở.
-- Món `default` KHÔNG có dòng ở user_cosmetics (ai cũng có). Chỉ service_role truy cập (như các bảng ghi khác).
--
-- Hạn dùng được so với giờ server mỗi lần đọc (expires_at <= now() = hết hạn): không cần job nền nên luôn đúng.

alter table public.profiles
  add column if not exists theme text check (theme is null or char_length(theme) <= 32),
  add column if not exists frame text check (frame is null or char_length(frame) <= 32);

create table public.cosmetics (
  id              text primary key check (id ~ '^[a-z][a-z0-9-]{1,23}$'),     -- bất biến; duy nhất trên mọi loại
  kind            text not null check (kind in ('theme', 'avatar', 'frame')),
  name            text not null check (char_length(name) between 1 and 80),
  rarity          text check (rarity is null or rarity in ('common', 'rare', 'epic', 'legendary')),
  unlock          jsonb not null default '{"type":"default"}'::jsonb,
  duration_days   int  check (duration_days is null or duration_days between 1 and 3650), -- null = vĩnh viễn
  available_from  timestamptz,                                                  -- "cửa nhận": chỉ nhận được trong khoảng này
  available_until timestamptz,
  active          boolean not null default true,                                -- false = ngừng cung cấp (người đã có vẫn giữ)
  updated_at      timestamptz not null default now(),
  check (jsonb_typeof(unlock) = 'object' and unlock ->> 'type' in ('default', 'level', 'event', 'grant')),
  check (unlock ->> 'type' <> 'level' or coalesce(unlock ->> 'level', '') ~ '^[0-9]{1,3}$'),
  check (unlock ->> 'type' <> 'event' or char_length(coalesce(unlock ->> 'event', '')) between 1 and 64),
  check (available_until is null or available_from is null or available_until > available_from)
);

create table public.user_cosmetics (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  cosmetic_id text not null references public.cosmetics (id),
  source      text not null check (source in ('level', 'event', 'grant')),
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz,                                                       -- null = vĩnh viễn
  seen_at     timestamptz,                                                       -- đã báo mở khóa (đúng một lần)
  warned      smallint not null default 0 check (warned between 0 and 3),       -- bậc nhắc hạn đã báo: 1 = còn ≤7 ngày, 2 = còn ≤1 ngày, 3 = đã hết hạn
  primary key (user_id, cosmetic_id)
);

alter table public.cosmetics      enable row level security;
alter table public.user_cosmetics enable row level security;
revoke all on public.cosmetics, public.user_cosmetics from anon, authenticated;
grant  all on public.cosmetics, public.user_cosmetics to service_role;

-- ---------------------------------------------------------------------
-- Cấp một món (sự kiện / admin tặng / level). Nguyên tử, idempotent:
--   • chưa có          → thêm, tính expires_at = now() + duration_days (level: luôn vĩnh viễn)
--   • đang còn hạn     → KHÔNG đổi gì (không cộng dồn, không gia hạn)
--   • đã hết hạn       → nhận lại, tính lại từ bây giờ (không cộng dồn); báo lại mở khóa
-- Trả true nếu có thay đổi. Nguồn 'grant' (admin tặng) bỏ qua `active` và cửa nhận; nguồn khác bị chặn khi món ngừng cung cấp
-- hoặc ngoài khoảng available_from/until. Lỗi: cosmetic_not_found · cosmetic_unavailable · cosmetic_bad_source.
-- ---------------------------------------------------------------------
create or replace function public.grant_cosmetic(p_user uuid, p_cosmetic text, p_source text) returns boolean
language plpgsql set search_path = public as $$
declare
  c   public.cosmetics%rowtype;
  v_exp timestamptz;
  v_n int;
begin
  if p_source not in ('level', 'event', 'grant') then raise exception 'cosmetic_bad_source'; end if;
  select * into c from cosmetics where id = p_cosmetic;
  if not found then raise exception 'cosmetic_not_found'; end if;
  if p_source <> 'grant' and (
       not c.active
       or (c.available_from  is not null and now() <  c.available_from)
       or (c.available_until is not null and now() >  c.available_until)
     ) then
    raise exception 'cosmetic_unavailable';
  end if;

  v_exp := case when p_source = 'level' or c.duration_days is null then null
                else now() + make_interval(days => c.duration_days) end;

  insert into user_cosmetics (user_id, cosmetic_id, source, granted_at, expires_at)
  values (p_user, p_cosmetic, p_source, now(), v_exp)
  on conflict (user_id, cosmetic_id) do update
    set source = excluded.source, granted_at = excluded.granted_at, expires_at = excluded.expires_at,
        seen_at = null, warned = 0
    where user_cosmetics.expires_at is not null and user_cosmetics.expires_at <= now();
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;
revoke all on function public.grant_cosmetic(uuid, text, text) from public;
grant execute on function public.grant_cosmetic(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------
-- Đồng bộ quyền theo level: cấp mọi món `level` đang bật mà người dùng đủ level và chưa có dòng. Level do ứng dụng
-- tính (core/xpLevel.ts) rồi truyền vào. Chỉ THÊM, không bao giờ thu hồi: hạ level (hoặc đổi công thức XP) không làm mất món.
-- Gọi nhiều lần vẫn an toàn. Trả mã các món vừa được cấp.
-- ---------------------------------------------------------------------
create or replace function public.sync_level_cosmetics(p_user uuid, p_level int) returns text[]
language sql set search_path = public as $$
  with ins as (
    insert into user_cosmetics (user_id, cosmetic_id, source)
    select p_user, c.id, 'level'
    from cosmetics c
    where c.active
      and c.unlock ->> 'type' = 'level'
      and (c.unlock ->> 'level')::int <= p_level
      and (c.available_from  is null or now() >= c.available_from)
      and (c.available_until is null or now() <= c.available_until)
    on conflict (user_id, cosmetic_id) do nothing
    returning cosmetic_id
  )
  select coalesce(array_agg(cosmetic_id order by cosmetic_id), '{}'::text[]) from ins
$$;
revoke all on function public.sync_level_cosmetics(uuid, int) from public;
grant execute on function public.sync_level_cosmetics(uuid, int) to service_role;
