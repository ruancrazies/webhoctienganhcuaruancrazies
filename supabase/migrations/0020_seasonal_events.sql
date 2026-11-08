-- 0020_seasonal_events.sql — Sự kiện theo mùa (giai đoạn 3): nhiệm vụ sự kiện, thưởng cosmetic, hạn dùng.
--
-- Hình thật của phần thưởng (ảnh avatar/khung, token theme) nằm trong CODE (src/cosmetics/*); DB chỉ điều khiển LỊCH và LUẬT:
--   seasonal_events   mỗi dòng một đợt sự kiện (một "lần chạy": giang-sinh-2026, giang-sinh-2027 là hai dòng riêng)
--   event_tasks       các nhiệm vụ của đợt đó; mỗi nhiệm vụ có thưởng XP và/hoặc một cosmetic
--   event_progress    tiến độ + trạng thái nhận thưởng của từng người
-- Chỉ service_role truy cập (như các bảng ghi khác): trình duyệt không đọc/ghi trực tiếp được.
--
-- Vòng đời: nháp → (xuất bản) → chưa tới giờ → đang diễn ra → hết giờ nhưng còn nhận thưởng (claim_days) → kết thúc.
--   • Tiến độ chỉ tăng trong [starts_at, ends_at). Nhận thưởng được tới ends_at + claim_days.
--   • Món nhận được có hạn dùng riêng (cosmetics.duration_days) → grant_cosmetic (0019) tính expires_at, hết hạn thì tự về mặc định,
--     lần sau sự kiện chạy lại (một dòng seasonal_events mới) nhận lại sẽ tính lại từ ngày nhận mới.
--   • Nhiệm vụ 'all' = hoàn thành mọi nhiệm vụ khác của đợt (giống 'all' ở nhiệm vụ ngày); target tự đồng bộ bằng trigger.
-- Bất biến được DB giữ (không chỉ ứng dụng): đã xuất bản thì không sửa nhiệm vụ; đã có người có tiến độ thì không đưa về nháp
-- hay xóa được.

create table public.seasonal_events (
  key         text primary key check (key ~ '^[a-z][a-z0-9-]{1,31}$'),
  name        text not null check (char_length(name) between 1 and 80),
  blurb       text check (blurb is null or char_length(blurb) between 1 and 240),
  starts_at   timestamptz not null,                                  -- 00:00 giờ VN của ngày bắt đầu
  ends_at     timestamptz not null,                                  -- 00:00 giờ VN của ngày SAU ngày kết thúc (loại trừ)
  claim_days  int  not null default 2 check (claim_days between 0 and 14),  -- còn nhận thưởng thêm bao nhiêu ngày sau ends_at
  status      text not null default 'draft' check (status in ('draft', 'published')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '120 days')                 -- chặn gõ nhầm năm
);
create index seasonal_events_range_idx on public.seasonal_events (starts_at, ends_at) where status = 'published';

create table public.event_tasks (
  id              bigint generated always as identity primary key,
  event_key       text not null references public.seasonal_events (key) on delete cascade,
  metric          text not null check (metric in ('learn', 'review', 'play', 'test', 'all')),
  target          int  not null check (target between 1 and 100000),
  title           text check (title is null or char_length(title) between 1 and 80),   -- null = tên mặc định theo metric (trong code)
  reward_xp       int  not null default 0 check (reward_xp between 0 and 100000),
  reward_cosmetic text references public.cosmetics (id),
  sort            int  not null default 0,
  check (reward_xp > 0 or reward_cosmetic is not null)               -- nhiệm vụ nào cũng phải có thưởng
);
create index event_tasks_event_idx on public.event_tasks (event_key, sort, id);
create unique index event_tasks_one_all on public.event_tasks (event_key) where metric = 'all';

create table public.event_progress (
  user_id    uuid   not null references public.profiles (id) on delete cascade,
  task_id    bigint not null references public.event_tasks (id) on delete cascade,
  progress   int    not null default 0 check (progress >= 0),
  claimed_at timestamptz,
  primary key (user_id, task_id)
);
create index event_progress_task_idx on public.event_progress (task_id);

alter table public.seasonal_events enable row level security;
alter table public.event_tasks     enable row level security;
alter table public.event_progress  enable row level security;
revoke all on public.seasonal_events, public.event_tasks, public.event_progress from anon, authenticated;
grant  all on public.seasonal_events, public.event_tasks, public.event_progress to service_role;
grant  usage on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------
-- Bảo vệ bất biến
-- ---------------------------------------------------------------------

-- Nhiệm vụ chỉ sửa được khi sự kiện còn là nháp. (Xóa cả sự kiện nháp kéo theo xóa nhiệm vụ: cho phép.)
create or replace function public.event_tasks_guard() returns trigger language plpgsql set search_path = public as $$
declare
  k text := coalesce(new.event_key, old.event_key);
  s text;
begin
  select status into s from seasonal_events where key = k;
  if s = 'published' then raise exception 'event_locked' using errcode = 'P0001'; end if;
  return coalesce(new, old);
end $$;
create trigger event_tasks_guard before insert or update or delete on public.event_tasks
  for each row execute function public.event_tasks_guard();

-- target của nhiệm vụ 'all' luôn bằng số nhiệm vụ khác trong đợt (tối thiểu 1). pg_trigger_depth chặn đệ quy do chính UPDATE này.
create or replace function public.event_tasks_sync_all() returns trigger language plpgsql set search_path = public as $$
declare k text := coalesce(new.event_key, old.event_key);
begin
  if pg_trigger_depth() > 1 then return null; end if;
  update event_tasks
     set target = greatest(1, (select count(*)::int from event_tasks b where b.event_key = k and b.metric <> 'all'))
   where event_key = k and metric = 'all';
  return null;
end $$;
create trigger event_tasks_sync_all after insert or update or delete on public.event_tasks
  for each row execute function public.event_tasks_sync_all();

-- Đã có người có tiến độ thì không đưa về nháp và không xóa được (mất tiến độ/thưởng của họ).
create or replace function public.seasonal_events_guard() returns trigger language plpgsql set search_path = public as $$
declare has_progress boolean;
begin
  if tg_op = 'DELETE' then
    if old.status = 'published' then raise exception 'event_published' using errcode = 'P0001'; end if;
    return old;
  end if;
  if old.status = 'published' and new.status = 'draft' then
    select exists (select 1 from event_progress p join event_tasks t on t.id = p.task_id where t.event_key = old.key) into has_progress;
    if has_progress then raise exception 'event_has_progress' using errcode = 'P0001'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger seasonal_events_guard before update or delete on public.seasonal_events
  for each row execute function public.seasonal_events_guard();

-- ---------------------------------------------------------------------
-- Ghi tiến độ sau một vòng học/chơi/kiểm tra (cùng delta với nhiệm vụ ngày). Chỉ tính cho sự kiện đã xuất bản và đang diễn ra
-- tại p_now. Một câu lệnh cho mọi nhiệm vụ khớp; sau đó tính lại 'all'. Khóa theo người để hai lần gọi đồng thời không làm 'all' thiếu.
-- Không tạo dòng khi không có gì để cộng (người không tham gia không tốn dòng).
-- ---------------------------------------------------------------------
create or replace function public.bump_event_progress(p_user uuid, p_now timestamptz, p_learn int, p_review int, p_play int, p_test int)
returns void language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('event-progress:' || p_user::text, 0));

  with running as (
    select t.id, t.event_key, t.metric, t.target
      from event_tasks t join seasonal_events e on e.key = t.event_key
     where e.status = 'published' and p_now >= e.starts_at and p_now < e.ends_at and t.metric <> 'all'
  ), delta as (
    select id, target, case metric
             when 'learn'  then greatest(coalesce(p_learn, 0), 0)
             when 'review' then greatest(coalesce(p_review, 0), 0)
             when 'play'   then greatest(coalesce(p_play, 0), 0)
             when 'test'   then greatest(coalesce(p_test, 0), 0) end as d
      from running
  )
  insert into event_progress (user_id, task_id, progress)
  select p_user, id, least(target, d) from delta where d > 0
  on conflict (user_id, task_id) do update
     set progress = least((select target from event_tasks where id = excluded.task_id), event_progress.progress + excluded.progress);

  insert into event_progress (user_id, task_id, progress)
  select p_user, a.id, least(a.target, c.done)
    from event_tasks a
    join seasonal_events e on e.key = a.event_key
    cross join lateral (
      select count(*)::int as done
        from event_tasks b join event_progress pr on pr.task_id = b.id and pr.user_id = p_user
       where b.event_key = a.event_key and b.metric <> 'all' and pr.progress >= b.target
    ) c
   where a.metric = 'all' and e.status = 'published' and p_now >= e.starts_at and p_now < e.ends_at and c.done > 0
  on conflict (user_id, task_id) do update set progress = excluded.progress;
end $$;

-- ---------------------------------------------------------------------
-- Nhận thưởng một nhiệm vụ: một giao dịch (khóa dòng → kiểm → ghi đã nhận → cộng XP → cấp cosmetic). Lỗi nào cũng hoàn tác tất cả.
--   Lỗi: task_not_found · event_not_running (chưa xuất bản / chưa tới giờ / quá hạn nhận) · task_not_ready · task_already_claimed
--        · profile_not_found · cosmetic_unavailable (món ngừng cung cấp hoặc ngoài cửa nhận của chính món)
-- XP cộng thẳng vào profiles.xp (KHÔNG đụng xp_today → không tính vào giới hạn XP/ngày), như claim_quest.
-- Trả { reward_xp, xp, cosmetic, granted }: granted = false khi người đó đang còn món (không gia hạn, không cộng dồn).
-- ---------------------------------------------------------------------
create or replace function public.claim_event_task(p_user uuid, p_task bigint, p_now timestamptz) returns jsonb
language plpgsql set search_path = public as $$
declare
  t         event_tasks;
  e         seasonal_events;
  pr        event_progress;
  v_done    int;
  v_need    int;
  v_xp      bigint;
  v_granted boolean := false;
begin
  select * into t from event_tasks where id = p_task;
  if not found then raise exception 'task_not_found' using errcode = 'P0001'; end if;
  select * into e from seasonal_events where key = t.event_key;
  if e.status <> 'published' or p_now < e.starts_at or p_now >= e.ends_at + make_interval(days => e.claim_days) then
    raise exception 'event_not_running' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('event-progress:' || p_user::text, 0));
  select * into pr from event_progress where user_id = p_user and task_id = p_task for update;
  if found and pr.claimed_at is not null then raise exception 'task_already_claimed' using errcode = 'P0001'; end if;

  if t.metric = 'all' then
    -- tính lại từ các nhiệm vụ khác, không tin cột progress của 'all'
    select count(*)::int into v_need from event_tasks where event_key = t.event_key and metric <> 'all';
    select count(*)::int into v_done
      from event_tasks b join event_progress x on x.task_id = b.id and x.user_id = p_user
     where b.event_key = t.event_key and b.metric <> 'all' and x.progress >= b.target;
    if v_need = 0 or v_done < v_need then raise exception 'task_not_ready' using errcode = 'P0001'; end if;
  elsif not found or pr.progress < t.target then
    raise exception 'task_not_ready' using errcode = 'P0001';
  end if;

  insert into event_progress (user_id, task_id, progress, claimed_at) values (p_user, p_task, t.target, p_now)
  on conflict (user_id, task_id) do update set claimed_at = p_now, progress = t.target;

  if t.reward_xp > 0 then
    update profiles set xp = xp + t.reward_xp where id = p_user returning xp into v_xp;
    if not found then raise exception 'profile_not_found' using errcode = 'P0002'; end if;
  else
    select xp into v_xp from profiles where id = p_user;
    if not found then raise exception 'profile_not_found' using errcode = 'P0002'; end if;
  end if;

  if t.reward_cosmetic is not null then
    v_granted := grant_cosmetic(p_user, t.reward_cosmetic, 'event');
  end if;

  return jsonb_build_object('reward_xp', t.reward_xp, 'xp', v_xp, 'cosmetic', t.reward_cosmetic, 'granted', v_granted);
end $$;

-- ---------------------------------------------------------------------
-- Nhân bản một đợt (sang năm / chạy lại): sao nhiệm vụ và phần thưởng, tạo ở trạng thái NHÁP với lịch mới. Nguyên tử.
-- ---------------------------------------------------------------------
create or replace function public.event_duplicate(p_src text, p_new text, p_starts timestamptz, p_ends timestamptz) returns void
language plpgsql set search_path = public as $$
begin
  insert into seasonal_events (key, name, blurb, starts_at, ends_at, claim_days)
  select p_new, name, blurb, p_starts, p_ends, claim_days from seasonal_events where key = p_src;
  if not found then raise exception 'event_not_found' using errcode = 'P0001'; end if;
  insert into event_tasks (event_key, metric, target, title, reward_xp, reward_cosmetic, sort)
  select p_new, metric, target, title, reward_xp, reward_cosmetic, sort from event_tasks where event_key = p_src order by sort, id;
end $$;

-- ---------------------------------------------------------------------
-- Thống kê cho trang quản trị: bao nhiêu người đã có tiến độ, bao nhiêu lượt nhận thưởng, mỗi đợt.
-- ---------------------------------------------------------------------
create or replace function public.event_stats(p_keys text[]) returns table (event_key text, participants bigint, claims bigint)
language sql stable set search_path = public as $$
  select t.event_key, count(distinct p.user_id), count(p.claimed_at)
    from event_tasks t join event_progress p on p.task_id = t.id
   where t.event_key = any (p_keys)
   group by t.event_key
$$;

revoke all on function public.event_tasks_guard(), public.event_tasks_sync_all(), public.seasonal_events_guard() from public;
revoke all on function public.bump_event_progress(uuid, timestamptz, int, int, int, int) from public, anon, authenticated;
revoke all on function public.claim_event_task(uuid, bigint, timestamptz)                from public, anon, authenticated;
revoke all on function public.event_duplicate(text, text, timestamptz, timestamptz)      from public, anon, authenticated;
grant execute on function public.bump_event_progress(uuid, timestamptz, int, int, int, int) to service_role;
grant execute on function public.claim_event_task(uuid, bigint, timestamptz)                to service_role;
grant execute on function public.event_duplicate(text, text, timestamptz, timestamptz)      to service_role;
revoke all on function public.event_stats(text[]) from public, anon, authenticated;
grant execute on function public.event_stats(text[]) to service_role;
