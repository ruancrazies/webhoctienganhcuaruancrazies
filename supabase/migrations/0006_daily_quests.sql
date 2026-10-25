-- 0006_daily_quests.sql — Nhiệm vụ hằng ngày.
-- Mỗi người, mỗi ngày (dayNo giờ VN) có tối đa 4 dòng: learn / review / play / all (thưởng hoàn thành tất cả).
-- Mục tiêu và thưởng được CHỐT trong dòng lúc tạo (định nghĩa nằm ở src/core/quests.ts), nên đổi định nghĩa không cần migration.
-- Chỉ service_role truy cập (như các bảng ghi khác): trình duyệt không đọc/ghi trực tiếp được.

create table public.daily_quests (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  day        int  not null,
  quest      text not null check (quest in ('learn', 'review', 'play', 'all')),
  progress   int  not null default 0 check (progress >= 0),
  target     int  not null check (target > 0),
  reward     int  not null check (reward > 0),
  claimed_at timestamptz,
  primary key (user_id, day, quest)
);

alter table public.daily_quests enable row level security;
revoke all on public.daily_quests from anon, authenticated;
grant all on public.daily_quests to service_role;

-- ---------------------------------------------------------------------
-- Ghi tiến độ. Tự tạo 4 dòng của ngày p_day nếu chưa có (p_defs: [{quest,target,reward}]), tăng tiến độ (chặn ở target),
-- tính lại 'all' = số nhiệm vụ cơ bản đã đủ tiến độ, và dọn dòng cũ hơn 7 ngày của người này.
-- Khóa các dòng của (người, ngày) trước để hai lần gọi đồng thời không làm 'all' bị tính thiếu.
-- ---------------------------------------------------------------------
create or replace function public.bump_quests(
  p_user uuid, p_day int, p_defs jsonb, p_learn int, p_review int, p_play int
) returns void language plpgsql set search_path = public as $$
begin
  insert into daily_quests (user_id, day, quest, target, reward)
  select p_user, p_day, d.quest, d.target, d.reward
    from jsonb_to_recordset(p_defs) as d(quest text, target int, reward int)
  on conflict (user_id, day, quest) do nothing;

  perform 1 from daily_quests where user_id = p_user and day = p_day for update;

  update daily_quests
     set progress = least(target, progress + case quest
           when 'learn'  then greatest(coalesce(p_learn, 0), 0)
           when 'review' then greatest(coalesce(p_review, 0), 0)
           when 'play'   then greatest(coalesce(p_play, 0), 0)
           else 0 end)
   where user_id = p_user and day = p_day and quest in ('learn', 'review', 'play');

  update daily_quests a
     set progress = least(a.target, (
           select count(*) from daily_quests b
            where b.user_id = a.user_id and b.day = a.day and b.quest <> 'all' and b.progress >= b.target))
   where a.user_id = p_user and a.day = p_day and a.quest = 'all';

  delete from daily_quests where user_id = p_user and day < p_day - 7;
end $$;

-- ---------------------------------------------------------------------
-- Nhận thưởng: một giao dịch. Cộng thẳng vào profiles.xp (KHÔNG đụng xp_today → không tính vào giới hạn XP/ngày).
-- Lỗi: quest_not_found (ngày đó chưa có tiến độ), quest_not_ready (chưa đủ), quest_already_claimed.
-- Trả { reward, xp }.
-- ---------------------------------------------------------------------
create or replace function public.claim_quest(p_user uuid, p_day int, p_quest text) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_row  daily_quests;
  v_done int;
  v_xp   bigint;
begin
  perform 1 from daily_quests where user_id = p_user and day = p_day for update;

  select * into v_row from daily_quests where user_id = p_user and day = p_day and quest = p_quest;
  if not found then raise exception 'quest_not_found' using errcode = 'P0001'; end if;
  if v_row.claimed_at is not null then raise exception 'quest_already_claimed' using errcode = 'P0001'; end if;

  if p_quest = 'all' then
    -- tính lại từ các dòng cơ bản, không tin cột progress của 'all'
    select count(*) into v_done from daily_quests
     where user_id = p_user and day = p_day and quest <> 'all' and progress >= target;
    if v_done < v_row.target then raise exception 'quest_not_ready' using errcode = 'P0001'; end if;
  elsif v_row.progress < v_row.target then
    raise exception 'quest_not_ready' using errcode = 'P0001';
  end if;

  update daily_quests set claimed_at = now() where user_id = p_user and day = p_day and quest = p_quest;
  update profiles set xp = xp + v_row.reward where id = p_user returning xp into v_xp;
  if not found then raise exception 'profile_not_found' using errcode = 'P0002'; end if;

  return jsonb_build_object('reward', v_row.reward, 'xp', v_xp);
end $$;

revoke all on function public.bump_quests(uuid, int, jsonb, int, int, int) from public, anon, authenticated;
revoke all on function public.claim_quest(uuid, int, text)                 from public, anon, authenticated;
grant execute on function public.bump_quests(uuid, int, jsonb, int, int, int) to service_role;
grant execute on function public.claim_quest(uuid, int, text)                 to service_role;
