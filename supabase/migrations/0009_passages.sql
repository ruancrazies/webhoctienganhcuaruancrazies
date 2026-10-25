-- 0009_passages.sql — Bài đọc hiểu và bài nghe cho bài kiểm tra.
-- Một đoạn văn (passages) có nhiều câu hỏi (passage_questions). Nguồn: tab `passages` và `passage_questions` trên Sheet,
-- nạp bằng `npm run content:sync` (cùng cơ chế key + content_hash + status như sentences / grammar_questions).
--
--   skill = 'reading'   : `body` hiển thị cho người học.
--   skill = 'listening' : `body` là lời thoại để đọc to (TTS, hoặc file `audio`); chỉ lộ sau khi nộp bài.
--   kind  = 'mcq'       : chọn đáp án; `options` 2–6 lựa chọn, `answer` = số thứ tự đáp án đúng (từ 1).
--   kind  = 'tf'        : đúng/sai; `options` rỗng, `answer` = 1 (đúng) hoặc 2 (sai).

create table public.passages (
  id           bigint generated always as identity primary key,
  key          text not null unique,
  skill        text not null check (skill in ('reading','listening')),
  level        text not null check (level in ('A1','A2','B1','B2','C1','C2')),
  title        text not null,
  body         text not null,
  topic        text,
  audio        text,
  source       text,
  status       text not null default 'active' check (status in ('active','draft','retired')),
  rand         double precision not null default random(),
  content_hash text,
  updated_at   timestamptz not null default now()
);
-- Bốc ngẫu nhiên một đoạn của (skill, level): đi theo `rand` như grammar_pick_idx.
create index passages_pick_idx on public.passages (skill, level, rand) where status = 'active';

create table public.passage_questions (
  id           bigint generated always as identity primary key,
  key          text not null unique,
  passage_id   bigint not null references public.passages (id),
  kind         text not null check (kind in ('mcq','tf')),
  question     text not null,
  options      jsonb not null default '[]'::jsonb,
  answer       int  not null,
  explanation  text,
  sort         int  not null default 1,
  status       text not null default 'active' check (status in ('active','draft','retired')),
  content_hash text,
  updated_at   timestamptz not null default now(),
  constraint passage_questions_shape check (
    (kind = 'mcq' and jsonb_typeof(options) = 'array'
                  and jsonb_array_length(options) between 2 and 6
                  and answer between 1 and jsonb_array_length(options))
    or
    (kind = 'tf'  and options = '[]'::jsonb and answer in (1, 2))
  )
);
create index passage_questions_passage_idx on public.passage_questions (passage_id, sort) where status = 'active';

-- Chứa đáp án (và lời thoại bài nghe) nên giống grammar_questions: chỉ service_role truy cập, không grant/policy cho anon/authenticated.
alter table public.passages          enable row level security;
alter table public.passage_questions enable row level security;
revoke all on public.passages, public.passage_questions from anon, authenticated;
grant all on public.passages, public.passage_questions to service_role;
grant all on all sequences in schema public to service_role;
