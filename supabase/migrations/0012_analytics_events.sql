-- 0012_analytics_events.sql — Giai đoạn 0 của thiết kế phân tích dữ liệu: THU THẬP, chưa phân tích.
--
-- Vì sao làm trước: app trước đây chỉ giữ trạng thái tổng hợp (SRS, grammar_stats) và bỏ đáp án người dùng chọn
-- sau khi chấm. Dữ liệu cũ KHÔNG backfill được, nên mỗi ngày chưa ghi là mất một ngày dữ liệu.
--
--   (1) answer_events   : mỗi câu đã trả lời một dòng (vòng chơi / bài thi lên cấp / bài kiểm tra).
--   (2) activity_events : hành vi nhẹ (bảng đã tạo sẵn; CHƯA có mã nào ghi vào — để giai đoạn 2).
--   (3) user_insights   : hồ sơ năng lực mỗi người một dòng jsonb (bảng đã tạo sẵn; để giai đoạn 2).
--   (4) level_exams.answers / practice_tests.answers : đáp án đã chọn để người dùng xem lại bài.
--   (5) Sửa 3 RPC nộp bài để ghi (1) và (4) CÙNG GIAO DỊCH với điểm.
--
-- Mọi bảng mới: bật RLS, thu hồi quyền anon/authenticated, chỉ service_role truy cập (như các bảng ghi khác).
-- Payload cũ (không có khóa `events` / `answers`) vẫn chạy bình thường.

-- =====================================================================
-- (1) answer_events
-- =====================================================================
create table public.answer_events (
  id                  bigint generated always as identity primary key,
  user_id             uuid   not null references public.profiles (id) on delete cascade,

  -- ngữ cảnh
  source              text   not null check (source in ('round', 'exam', 'practice')),
  source_id           uuid   not null,        -- game_rounds.id / level_exams.id / practice_tests.id
  qid                 text   not null,        -- mã câu trong items của bài (q1, q2, …)
  game                text   not null,        -- quiz, type, cloze, … hoặc grammar / passage (bài thi)
  part                text   not null check (part in ('vocab', 'grammar', 'reading', 'listening')),

  -- đối tượng được hỏi
  word_id             bigint,
  grammar_id          bigint,
  passage_id          bigint,
  passage_question_id bigint,                 -- chỉ có ở bài thi/kiểm tra mới tạo sau migration này
  -- nhãn SAO CHÉP lúc ghi (như user_word_progress.cefr/domain) để thống kê không cần join bảng nội dung
  cefr                text,
  domain              text,
  pos                 text,
  grammar_topic       text,

  -- kết quả
  correct             boolean not null,
  near                boolean not null default false,   -- đúng "gần đúng" (sai một ký tự)
  hint_used           boolean not null default false,
  attempts            int,
  answer_value        text   not null default '',       -- đáp án người dùng chọn/gõ, cắt ≤ 200 ký tự; '' = bỏ trống
  expected            text   not null default '',       -- đáp án đúng, cắt ≤ 200 ký tự

  -- hành vi. Do TRÌNH DUYỆT báo → chỉ là tín hiệu mềm, KHÔNG dùng cho điểm/XP/xếp hạng.
  response_ms         int check (response_ms is null or response_ms between 0 and 120000),
  answered_at         timestamptz not null default now()
);
create index answer_events_user_idx   on public.answer_events (user_id, answered_at desc);
create index answer_events_word_idx   on public.answer_events (word_id)    where word_id is not null;
create index answer_events_gram_idx   on public.answer_events (grammar_id) where grammar_id is not null;
create index answer_events_game_idx   on public.answer_events (game, answered_at);
-- Chốt chặn thứ hai chống ghi trùng (chốt chặn thứ nhất: các RPC chỉ ghi khi đóng được bài lần đầu).
create unique index answer_events_once_idx on public.answer_events (source, source_id, qid);

-- =====================================================================
-- (2) activity_events — tạo sẵn, chưa có mã ghi
-- =====================================================================
create table public.activity_events (
  id         bigint generated always as identity primary key,
  user_id    uuid  not null references public.profiles (id) on delete cascade,
  session_id uuid,                                  -- tính phía server: cùng người, nghỉ < 30 phút là cùng phiên
  type       text  not null,                        -- play/start, play/finish, exam/start, …
  props      jsonb not null default '{}'::jsonb,
  at         timestamptz not null default now()
);
create index activity_events_user_idx on public.activity_events (user_id, at desc);
create index activity_events_type_idx on public.activity_events (type, at);

-- =====================================================================
-- (3) user_insights — tạo sẵn, chưa có mã ghi
-- =====================================================================
create table public.user_insights (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.answer_events   enable row level security;
alter table public.activity_events enable row level security;
alter table public.user_insights   enable row level security;
revoke all on public.answer_events, public.activity_events, public.user_insights from anon, authenticated;
grant  all on public.answer_events, public.activity_events, public.user_insights to service_role;
grant  all on all sequences in schema public to service_role;

-- =====================================================================
-- (4) Đáp án đã chọn của bài thi / bài kiểm tra: [{qid, value, correct, near}]
--     NULL = bài làm trước migration này, bài bỏ dở hoặc hết giờ (không có câu trả lời nào được gửi lên).
-- =====================================================================
alter table public.level_exams    add column if not exists answers jsonb;
alter table public.practice_tests add column if not exists answers jsonb;

-- =====================================================================
-- Hàm dùng chung: ghi các sự kiện trả lời của MỘT bài.
-- p_events: [{qid, game, part, word_id?, grammar_id?, passage_id?, passage_question_id?,
--             correct, near?, hint_used?, attempts?, answer_value?, expected?, response_ms?}]
-- Nhãn cefr/domain/pos/grammar_topic lấy từ bảng nội dung ngay tại đây (một nguồn, không để client/TS tự điền).
-- Trả số dòng thực sự ghi. `on conflict do nothing`: không bao giờ làm hỏng đường nộp bài chính.
-- =====================================================================
create or replace function public.record_answer_events(p_user uuid, p_source text, p_source_id uuid, p_events jsonb)
returns int language plpgsql set search_path = public as $$
declare
  v_n int;
begin
  if jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events) = 0 then
    return 0;
  end if;

  -- `with ordinality` + `order by`: id của sự kiện tăng đúng theo thứ tự câu trong đề (join không bảo đảm thứ tự chèn).
  with ins as (
    insert into answer_events (
      user_id, source, source_id, qid, game, part,
      word_id, grammar_id, passage_id, passage_question_id,
      cefr, domain, pos, grammar_topic,
      correct, near, hint_used, attempts, answer_value, expected, response_ms)
    select
      p_user, p_source, p_source_id, t.j ->> 'qid', t.j ->> 'game', t.j ->> 'part',
      (t.j ->> 'word_id')::bigint, (t.j ->> 'grammar_id')::bigint,
      (t.j ->> 'passage_id')::bigint, (t.j ->> 'passage_question_id')::bigint,
      coalesce(w.cefr, g.level, ps.level), w.domain, w.pos, g.topic,
      coalesce((t.j ->> 'correct')::boolean, false),
      coalesce((t.j ->> 'near')::boolean, false),
      coalesce((t.j ->> 'hint_used')::boolean, false),
      (t.j ->> 'attempts')::int,
      left(coalesce(t.j ->> 'answer_value', ''), 200),
      left(coalesce(t.j ->> 'expected', ''), 200),
      -- GREATEST/LEAST bỏ qua NULL nên phải chặn riêng: thiếu số đo là NULL, không phải 0 ms
      case when t.j ->> 'response_ms' is null then null
           else least(greatest((t.j ->> 'response_ms')::int, 0), 120000) end
    from jsonb_array_elements(p_events) with ordinality as t(j, ord)
    left join words w             on w.id  = (t.j ->> 'word_id')::bigint
    left join grammar_questions g on g.id  = (t.j ->> 'grammar_id')::bigint
    left join passages ps         on ps.id = (t.j ->> 'passage_id')::bigint
    order by t.ord
    on conflict (source, source_id, qid) do nothing
    returning 1
  )
  select count(*) into v_n from ins;
  return v_n;
end $$;

revoke all on function public.record_answer_events(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_answer_events(uuid, text, uuid, jsonb) to service_role;

-- =====================================================================
-- (5a) apply_round_result: thêm payload.events (khớp 0003, chỉ thêm đoạn ghi sự kiện)
-- payload: { today, xp, updates, grammar, blitz, events? }
-- =====================================================================
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

  -- MỚI: sự kiện từng câu đã trả lời (cùng giao dịch → nộp hai lần không ghi trùng)
  perform record_answer_events(p_user, 'round', p_round, p_payload -> 'events');

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

-- =====================================================================
-- (5b) apply_exam_result: thêm payload.answers + payload.events (khớp 0011)
-- payload: { passed, total, vocab, grammar, reading?, listening?, today, answers?, events? }
-- =====================================================================
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
         score_grammar = (p_payload ->> 'grammar')::numeric,
         score_reading = (p_payload ->> 'reading')::numeric,
         score_listening = (p_payload ->> 'listening')::numeric,
         answers = case when jsonb_typeof(p_payload -> 'answers') = 'array' then p_payload -> 'answers' else null end
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

  perform record_answer_events(p_user, 'exam', p_exam, p_payload -> 'events');

  v_streak := touch_streak(p_user, (p_payload ->> 'today')::int);
  return jsonb_build_object('streak', v_streak, 'cefr', v_cefr, 'passed', v_passed);
end $$;

-- =====================================================================
-- (5c) apply_practice_result: thêm payload.answers + payload.events (khớp 0011)
-- payload: { total, vocab, grammar, reading?, listening?, today, wrongWords, answers?, events? }
-- =====================================================================
create or replace function public.apply_practice_result(p_user uuid, p_test uuid, p_payload jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_streak int;
begin
  update practice_tests
     set finished_at = now(),
         score_total     = (p_payload ->> 'total')::numeric,
         score_vocab     = (p_payload ->> 'vocab')::numeric,
         score_grammar   = (p_payload ->> 'grammar')::numeric,
         score_reading   = (p_payload ->> 'reading')::numeric,
         score_listening = (p_payload ->> 'listening')::numeric,
         answers = case when jsonb_typeof(p_payload -> 'answers') = 'array' then p_payload -> 'answers' else null end
   where id = p_test and user_id = p_user and finished_at is null;
  if not found then
    raise exception 'test_finished_or_invalid' using errcode = 'P0001';
  end if;

  update user_word_progress p
     set next_review = now(), updated_at = now()
    from (select e.value::bigint as word_id
            from jsonb_array_elements_text(coalesce(p_payload -> 'wrongWords', '[]'::jsonb)) as e(value)) w
   where p.user_id = p_user and p.word_id = w.word_id and p.next_review > now();

  perform record_answer_events(p_user, 'practice', p_test, p_payload -> 'events');

  v_streak := touch_streak(p_user, (p_payload ->> 'today')::int);
  return jsonb_build_object('streak', v_streak);
end $$;

-- create or replace giữ nguyên quyền đã cấp ở 0003 / 0007; nhắc lại cho chắc.
revoke all on function public.apply_round_result(uuid, uuid, jsonb)    from public, anon, authenticated;
revoke all on function public.apply_exam_result(uuid, uuid, jsonb)     from public, anon, authenticated;
revoke all on function public.apply_practice_result(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_round_result(uuid, uuid, jsonb)    to service_role;
grant execute on function public.apply_exam_result(uuid, uuid, jsonb)     to service_role;
grant execute on function public.apply_practice_result(uuid, uuid, jsonb) to service_role;
