-- 0007_practice_tests.sql — Bài kiểm tra thường xuyên (làm lúc nào cũng được, không khóa cấp, không giờ chờ)
-- + nhiệm vụ ngày "Làm một bài kiểm tra".
-- Bảng RIÊNG, tách khỏi level_exams: không đụng lượt thi/ngày, giờ chờ, level_passes của bài thi lên cấp.
-- Chỉ service_role truy cập (đề chứa đáp án).

create table public.practice_tests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  items         jsonb not null,
  started_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  finished_at   timestamptz,
  score_total   numeric,
  score_vocab   numeric,
  score_grammar numeric
);
create index practice_tests_user_idx on public.practice_tests (user_id, started_at desc);
-- Tối đa một bài chưa kết thúc mỗi người (kể cả hai request song song).
create unique index practice_tests_one_open_idx on public.practice_tests (user_id) where finished_at is null;

alter table public.practice_tests enable row level security;
revoke all on public.practice_tests from anon, authenticated;
grant all on public.practice_tests to service_role;

-- Hết giờ mà chưa nộp: đóng bài tại expires_at, KHÔNG có điểm (không vào lịch sử điểm).
create or replace function public.fail_practice_test(p_user uuid, p_test uuid) returns boolean
language plpgsql set search_path = public as $$
begin
  update practice_tests set finished_at = expires_at
   where id = p_test and user_id = p_user and finished_at is null;
  return found;
end $$;

-- Nộp bài — MỘT giao dịch: ghi điểm, hẹn ôn lại ngay các từ làm sai (chỉ đưa next_review về hiện tại, KHÔNG đổi level
-- nên bộ đếm "đã học" không bị lệch), cập nhật chuỗi ngày. Không cộng XP (thưởng nằm ở nhiệm vụ ngày).
-- payload: { total, vocab, grammar (0..1), today:int, wrongWords:[word_id] }
create or replace function public.apply_practice_result(p_user uuid, p_test uuid, p_payload jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_streak int;
begin
  update practice_tests
     set finished_at = now(),
         score_total   = (p_payload ->> 'total')::numeric,
         score_vocab   = (p_payload ->> 'vocab')::numeric,
         score_grammar = (p_payload ->> 'grammar')::numeric
   where id = p_test and user_id = p_user and finished_at is null;
  if not found then
    raise exception 'test_finished_or_invalid' using errcode = 'P0001';
  end if;

  update user_word_progress p
     set next_review = now(), updated_at = now()
    from (select e.value::bigint as word_id
            from jsonb_array_elements_text(coalesce(p_payload -> 'wrongWords', '[]'::jsonb)) as e(value)) w
   where p.user_id = p_user and p.word_id = w.word_id and p.next_review > now();

  v_streak := touch_streak(p_user, (p_payload ->> 'today')::int);
  return jsonb_build_object('streak', v_streak);
end $$;

revoke all on function public.fail_practice_test(uuid, uuid)            from public, anon, authenticated;
revoke all on function public.apply_practice_result(uuid, uuid, jsonb)  from public, anon, authenticated;
grant execute on function public.fail_practice_test(uuid, uuid)           to service_role;
grant execute on function public.apply_practice_result(uuid, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------
-- Nhiệm vụ ngày: thêm 'test'. bump_quests nhận thêm p_test (hàm cũ 6 tham số bị thay).
-- ---------------------------------------------------------------------
alter table public.daily_quests drop constraint if exists daily_quests_quest_check;
alter table public.daily_quests add constraint daily_quests_quest_check check (quest in ('learn', 'review', 'play', 'test', 'all'));

drop function if exists public.bump_quests(uuid, int, jsonb, int, int, int);

create or replace function public.bump_quests(
  p_user uuid, p_day int, p_defs jsonb, p_learn int, p_review int, p_play int, p_test int
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
           when 'test'   then greatest(coalesce(p_test, 0), 0)
           else 0 end)
   where user_id = p_user and day = p_day and quest in ('learn', 'review', 'play', 'test');

  update daily_quests a
     set progress = least(a.target, (
           select count(*) from daily_quests b
            where b.user_id = a.user_id and b.day = a.day and b.quest <> 'all' and b.progress >= b.target))
   where a.user_id = p_user and a.day = p_day and a.quest = 'all';

  delete from daily_quests where user_id = p_user and day < p_day - 7;
end $$;

revoke all on function public.bump_quests(uuid, int, jsonb, int, int, int, int) from public, anon, authenticated;
grant execute on function public.bump_quests(uuid, int, jsonb, int, int, int, int) to service_role;
