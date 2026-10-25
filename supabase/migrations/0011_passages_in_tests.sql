-- 0011_passages_in_tests.sql — Nối bài đọc / bài nghe (0009) vào bài kiểm tra thường xuyên và bài thi lên cấp.
-- Chỉ thêm cột điểm cho hai kỹ năng mới và cho hai hàm nộp bài đọc thêm các khóa `reading` / `listening` trong payload.
-- Payload cũ (không có hai khóa này) vẫn chạy bình thường: cột để NULL = đề không có phần đó.

alter table public.level_exams    add column if not exists score_reading   numeric;
alter table public.level_exams    add column if not exists score_listening numeric;
alter table public.practice_tests add column if not exists score_reading   numeric;
alter table public.practice_tests add column if not exists score_listening numeric;

-- Thi lên cấp: payload { passed, total, vocab, grammar, reading?, listening?, today }
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
         score_listening = (p_payload ->> 'listening')::numeric
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

-- Kiểm tra thường xuyên: payload { total, vocab, grammar, reading?, listening?, today, wrongWords }
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
         score_listening = (p_payload ->> 'listening')::numeric
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
