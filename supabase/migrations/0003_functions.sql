-- 0003_functions.sql — trigger tạo profile và các hàm ghi nguyên tử (mục 5.7, 5.12, 5.13).
-- Logic nghiệp vụ (SRS, chấm, mở khóa) nằm ở TypeScript (ADR-2); SQL chỉ khóa dòng, ghi hàng loạt, tính chênh lệch.
-- Mọi hàm chỉ service_role được gọi (xem cuối file).

-- ---------------------------------------------------------------------
-- Profile tự tạo khi có người dùng mới (username lấy từ user_metadata.username)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(v_name, 'user_' || substr(replace(new.id::text, '-', ''), 1, 8)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Giới hạn tần suất (ADR-9): cửa sổ cố định, đếm trong Postgres.
-- Trả true nếu còn được phép. Dọn các cửa sổ cũ của cùng key khi ghi.
-- ---------------------------------------------------------------------
create or replace function public.hit_rate_limit(p_key text, p_window_seconds int, p_max int)
returns boolean language plpgsql set search_path = public as $$
declare
  v_start timestamptz;
  v_count int;
begin
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into rate_limits (key, window_start, count) values (p_key, v_start, 1)
  on conflict (key, window_start) do update set count = rate_limits.count + 1
  returning count into v_count;
  delete from rate_limits
   where key = p_key and window_start < v_start - make_interval(secs => p_window_seconds * 2);
  return v_count <= p_max;
end $$;

-- ---------------------------------------------------------------------
-- Chuỗi ngày (khớp core/streak.touchStreak). p_today = dayNo theo giờ Việt Nam.
-- ---------------------------------------------------------------------
create or replace function public.touch_streak(p_user uuid, p_today int) returns int
language plpgsql set search_path = public as $$
declare
  v_last int; v_streak int; v_best int;
begin
  select last_day, streak, best_streak into v_last, v_streak, v_best
    from profiles where id = p_user for update;
  if not found then raise exception 'profile_not_found' using errcode = 'P0002'; end if;
  if v_last is not distinct from p_today then return v_streak; end if;
  v_streak := case when v_last = p_today - 1 then v_streak + 1 else 1 end;
  update profiles
     set last_day = p_today, streak = v_streak, best_streak = greatest(v_best, v_streak)
   where id = p_user;
  return v_streak;
end $$;

-- ---------------------------------------------------------------------
-- Kết thúc một vòng chơi — MỘT giao dịch (mục 5.7).
-- payload: { today:int, xp:int,
--            updates:[{word_id,level,bad,next_review}],
--            grammar:[{level,correct}],
--            blitz:{key,score} | null }
-- Trả: { xp, streak, newBest, board }
-- Nộp lần hai (finished_at đã có) → lỗi 'round_finished_or_invalid'.
-- ---------------------------------------------------------------------
create or replace function public.apply_round_result(p_user uuid, p_round uuid, p_payload jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_today   int := (p_payload ->> 'today')::int;
  v_xp      int := coalesce((p_payload ->> 'xp')::int, 0);
  v_updates jsonb := coalesce(p_payload -> 'updates', '[]'::jsonb);
  v_blitz_key   text := p_payload -> 'blitz' ->> 'key';
  v_blitz_score int  := (p_payload -> 'blitz' ->> 'score')::int;
  v_streak int; v_total_xp bigint; v_old_best int;
  v_new_best boolean := false;
  v_board jsonb := null;
begin
  update game_rounds set finished_at = now()
   where id = p_round and user_id = p_user and finished_at is null;
  if not found then
    raise exception 'round_finished_or_invalid' using errcode = 'P0001';
  end if;

  if jsonb_array_length(v_updates) > 0 then
    -- khóa các dòng tiến độ sẽ ghi (hai vòng đồng thời của cùng người không ghi đè nhau)
    perform 1 from user_word_progress
      where user_id = p_user
        and word_id in (select (e ->> 'word_id')::bigint from jsonb_array_elements(v_updates) e)
      for update;

    with u as (
      select distinct on (word_id) word_id, level, bad, next_review
        from jsonb_to_recordset(v_updates) as x(word_id bigint, level int, bad int, next_review timestamptz)
       order by word_id
    ),
    w as (
      select u.word_id, u.level, u.bad, u.next_review, wd.cefr, wd.domain
        from u join words wd on wd.id = u.word_id
    ),
    old as (
      select p.word_id, p.level from user_word_progress p
       where p.user_id = p_user and p.word_id in (select word_id from w)
    ),
    ups as (
      insert into user_word_progress (user_id, word_id, cefr, domain, level, bad, next_review, updated_at)
      select p_user, word_id, cefr, domain, level, bad, next_review, now() from w
      on conflict (user_id, word_id) do update
        set level = excluded.level, bad = excluded.bad,
            next_review = excluded.next_review, updated_at = now()
      returning 1
    ),
    delta as (
      -- bộ đếm theo CHÊNH LỆCH giữa level cũ và mới
      select w.cefr, w.domain,
             sum((w.level >= 1)::int - coalesce((o.level >= 1)::int, 0)) as dl,
             sum((w.level >= 3)::int - coalesce((o.level >= 3)::int, 0)) as dm
        from w left join old o on o.word_id = w.word_id
       group by w.cefr, w.domain
    )
    insert into user_level_stats (user_id, cefr, domain, learned, mastered)
    select p_user, cefr, domain, dl, dm from delta
    on conflict (user_id, cefr, domain) do update
      set learned  = greatest(user_level_stats.learned  + excluded.learned,  0),
          mastered = greatest(user_level_stats.mastered + excluded.mastered, 0);
  end if;

  insert into grammar_stats (user_id, level, correct, total)
  select p_user, g.level, count(*) filter (where g.correct), count(*)
    from jsonb_to_recordset(coalesce(p_payload -> 'grammar', '[]'::jsonb)) as g(level text, correct boolean)
   group by g.level
  on conflict (user_id, level) do update
    set correct = grammar_stats.correct + excluded.correct,
        total   = grammar_stats.total   + excluded.total;

  v_streak := touch_streak(p_user, v_today);

  update profiles
     set xp       = xp + v_xp,
         xp_today = (case when xp_day = v_today then xp_today else 0 end) + v_xp,
         xp_day   = v_today
   where id = p_user
   returning xp into v_total_xp;

  if v_blitz_key is not null then
    select best into v_old_best from game_scores where user_id = p_user and game = v_blitz_key;
    v_new_best := v_old_best is null or v_blitz_score > v_old_best;
    insert into game_scores (user_id, game, best, plays) values (p_user, v_blitz_key, v_blitz_score, 1)
    on conflict (user_id, game) do update
      set best = greatest(game_scores.best, excluded.best), plays = game_scores.plays + 1;
    select coalesce(jsonb_agg(jsonb_build_object('username', t.username, 'best', t.best) order by t.best desc), '[]'::jsonb)
      into v_board
      from (select p.username, gs.best
              from game_scores gs join profiles p on p.id = gs.user_id
             where gs.game = v_blitz_key
             order by gs.best desc limit 5) t;
  end if;

  return jsonb_build_object('xp', v_total_xp, 'streak', v_streak, 'newBest', v_new_best, 'board', v_board);
end $$;

-- ---------------------------------------------------------------------
-- Chế độ Học: đánh dấu "đã học" (mục 4.5, 5.12). Tối đa 50 từ/lần.
-- Từ chưa có tiến độ hoặc đang level 0 → level 1, đến hạn ngay. Không đụng xp, mastered, chuỗi ngày.
-- Trả số từ thực sự được chuyển lên level 1.
-- ---------------------------------------------------------------------
create or replace function public.mark_learned(p_user uuid, p_word_ids bigint[]) returns int
language plpgsql set search_path = public as $$
declare v_n int;
begin
  if coalesce(array_length(p_word_ids, 1), 0) > 50 then
    raise exception 'too_many_words' using errcode = 'P0001';
  end if;

  perform 1 from user_word_progress where user_id = p_user and word_id = any (p_word_ids) for update;

  with todo as (
    select w.id, w.cefr, w.domain
      from words w
      left join user_word_progress p on p.user_id = p_user and p.word_id = w.id
     where w.id = any (p_word_ids) and w.status = 'active'
       and (p.word_id is null or p.level = 0)
  ),
  ins as (
    insert into user_word_progress (user_id, word_id, cefr, domain, level, bad, next_review, updated_at)
    select p_user, id, cefr, domain, 1, 0, now(), now() from todo
    on conflict (user_id, word_id) do update
      set level = 1, bad = 0, next_review = now(), updated_at = now()
    returning 1
  ),
  st as (
    insert into user_level_stats (user_id, cefr, domain, learned, mastered)
    select p_user, cefr, domain, count(*), 0 from todo group by cefr, domain
    on conflict (user_id, cefr, domain) do update
      set learned = user_level_stats.learned + excluded.learned
    returning 1
  )
  select count(*) into v_n from todo;
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- Bài thi lên cấp (mục 4.6, 5.13)
-- payload: { passed:bool, total, vocab, grammar:number, today:int }
-- Chỉ ghi level_exams + level_passes + chuỗi ngày. KHÔNG đụng xp, SRS, grammar_stats (ADR-8).
-- ---------------------------------------------------------------------
create or replace function public.apply_exam_result(p_user uuid, p_exam uuid, p_payload jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_cefr text;
  v_passed boolean := (p_payload ->> 'passed')::boolean;
  v_total numeric := (p_payload ->> 'total')::numeric;
  v_streak int;
begin
  update level_exams
     set finished_at = now(), passed = v_passed, score_total = v_total,
         score_vocab = (p_payload ->> 'vocab')::numeric,
         score_grammar = (p_payload ->> 'grammar')::numeric
   where id = p_exam and user_id = p_user and finished_at is null
   returning cefr into v_cefr;
  if not found then
    raise exception 'exam_finished_or_invalid' using errcode = 'P0001';
  end if;

  if v_passed then
    insert into level_passes (user_id, cefr, passed_at, score, exam_id)
    values (p_user, v_cefr, now(), v_total, p_exam)
    on conflict (user_id, cefr) do nothing;
  end if;

  v_streak := touch_streak(p_user, (p_payload ->> 'today')::int);
  return jsonb_build_object('streak', v_streak, 'cefr', v_cefr, 'passed', v_passed);
end $$;

-- Hết giờ mà chưa nộp = trượt, điểm 0, kết thúc tại expires_at. Trả true nếu có đóng được bài.
create or replace function public.fail_exam(p_user uuid, p_exam uuid) returns boolean
language plpgsql set search_path = public as $$
begin
  update level_exams
     set finished_at = expires_at, passed = false, score_total = 0, score_vocab = 0, score_grammar = 0
   where id = p_exam and user_id = p_user and finished_at is null;
  return found;
end $$;

-- ---------------------------------------------------------------------
-- Làm mới content_stats sau mỗi lần sync (chỉ đếm từ active). Trong một giao dịch của hàm.
-- ---------------------------------------------------------------------
create or replace function public.refresh_content_stats() returns void
language plpgsql set search_path = public as $$
begin
  delete from content_stats;
  insert into content_stats (cefr, domain, topic_id, word_count)
  select cefr, domain, null, count(*) from words where status = 'active' group by cefr, domain;
  insert into content_stats (cefr, domain, topic_id, word_count)
  select w.cefr, w.domain, wt.topic_id, count(*)
    from word_topics wt join words w on w.id = wt.word_id
   where w.status = 'active'
   group by w.cefr, w.domain, wt.topic_id;
end $$;

-- ---------------------------------------------------------------------
-- Quyền: hàm chỉ chạy bằng service_role (mã server). Trình duyệt không gọi được.
-- ---------------------------------------------------------------------
revoke all on function public.hit_rate_limit(text, int, int)        from public, anon, authenticated;
revoke all on function public.touch_streak(uuid, int)               from public, anon, authenticated;
revoke all on function public.apply_round_result(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.mark_learned(uuid, bigint[])          from public, anon, authenticated;
revoke all on function public.apply_exam_result(uuid, uuid, jsonb)  from public, anon, authenticated;
revoke all on function public.fail_exam(uuid, uuid)                 from public, anon, authenticated;
revoke all on function public.refresh_content_stats()               from public, anon, authenticated;

grant execute on function public.hit_rate_limit(text, int, int)        to service_role;
grant execute on function public.touch_streak(uuid, int)               to service_role;
grant execute on function public.apply_round_result(uuid, uuid, jsonb) to service_role;
grant execute on function public.mark_learned(uuid, bigint[])          to service_role;
grant execute on function public.apply_exam_result(uuid, uuid, jsonb)  to service_role;
grant execute on function public.fail_exam(uuid, uuid)                 to service_role;
grant execute on function public.refresh_content_stats()               to service_role;
