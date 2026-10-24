-- 0001_schema.sql — bảng nội dung, bảng người dùng, index (mục 3 của tài liệu kiến trúc).
-- Yêu cầu PostgreSQL >= 15 (dùng UNIQUE NULLS NOT DISTINCT). Supabase mới tạo là 15/17.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- =====================================================================
-- Nội dung (nguồn: Google Sheet, nạp bằng `npm run content:sync`)
-- Không xóa: chỉ đổi status (active / draft / retired).
-- =====================================================================

create table public.domains (
  code  text primary key check (code ~ '^[a-z0-9_]+$'),
  title text not null,
  emoji text
);

create table public.topics (
  id     bigint generated always as identity primary key,
  slug   text not null unique,
  title  text not null,
  emoji  text,
  cefr   text not null check (cefr in ('A1','A2','B1','B2','C1','C2')),
  domain text not null references public.domains (code),
  sort   int
);
create index topics_cefr_domain_idx on public.topics (cefr, domain);

create table public.words (
  id            bigint generated always as identity primary key,
  key           text not null unique,
  en            text not null,
  pos           text not null,
  vi            text not null,
  vi_alt        text[] not null default '{}',
  ipa           text,
  cefr          text not null check (cefr in ('A1','A2','B1','B2','C1','C2')),
  freq_rank     int  not null default 1000000000,
  domain        text not null references public.domains (code),
  quality       text,                                   -- chỉ ghi chú
  status        text not null default 'active' check (status in ('active','draft','retired')),
  rand          double precision not null default random(),  -- cố định sau khi tạo; sync KHÔNG ghi đè
  has_audio     boolean not null default false,         -- (SAU) chưa dùng
  has_image     boolean not null default false,         -- (SAU) chưa dùng
  media_version int not null default 0,                 -- (SAU) chưa dùng
  content_hash  text,                                   -- băm các cột nội dung, để sync chỉ ghi dòng đổi
  updated_at    timestamptz not null default now()
);
-- Chọn ngẫu nhiên theo cột rand (ADR-4), danh sách học theo keyset, đáp án nhiễu, tìm kiếm.
create index words_pick_idx     on public.words (cefr, domain, rand)              where status = 'active';
create index words_rank_idx     on public.words (cefr, domain, freq_rank, id)     where status = 'active';
create index words_distract_idx on public.words (pos, cefr, rand)                 where status = 'active';
create index words_en_trgm_idx  on public.words using gin (en extensions.gin_trgm_ops);

create table public.word_topics (
  topic_id bigint not null references public.topics (id),
  word_id  bigint not null references public.words (id),
  rand     double precision not null,   -- bản sao words.rand (cố định) để chọn ngẫu nhiên theo chủ đề bằng index, không quét words
  primary key (topic_id, word_id)
);
create index word_topics_word_idx on public.word_topics (word_id);
create index word_topics_pick_idx on public.word_topics (topic_id, rand);

create table public.sentences (
  id           bigint generated always as identity primary key,
  key          text not null unique,
  en           text not null,
  vi           text,
  cefr         text check (cefr in ('A1','A2','B1','B2','C1','C2')),
  kind         text,          -- statement / negative / question / conditional / passive …
  source       text,
  status       text not null default 'active' check (status in ('active','draft','retired')),
  has_audio    boolean not null default false,
  content_hash text,
  updated_at   timestamptz not null default now()
);
create index sentences_cefr_kind_idx on public.sentences (cefr, kind);

create table public.sentence_words (
  word_id     bigint not null references public.words (id),
  sentence_id bigint not null references public.sentences (id),
  primary key (word_id, sentence_id)
);
create index sentence_words_sentence_idx on public.sentence_words (sentence_id);

create table public.grammar_questions (
  id           bigint generated always as identity primary key,
  key          text not null unique,
  level        text not null check (level in ('A1','A2','B1','B2','C1','C2')),
  topic        text,
  question     text not null,
  options      jsonb not null,
  answer       int  not null check (answer >= 1),   -- số thứ tự đáp án đúng, từ 1
  explanation  text,
  status       text not null default 'active' check (status in ('active','draft','retired')),
  rand         double precision not null default random(),
  content_hash text,
  updated_at   timestamptz not null default now()
);
create index grammar_level_topic_idx on public.grammar_questions (level, topic);
create index grammar_pick_idx        on public.grammar_questions (level, rand) where status = 'active';

-- Bộ đếm số từ active: topic_id null = tổng theo (cefr, domain); có topic_id = theo chủ đề.
-- Làm mới bằng refresh_content_stats() sau mỗi lần sync.
create table public.content_stats (
  cefr       text not null,
  domain     text not null,
  topic_id   bigint,
  word_count int  not null,
  unique nulls not distinct (cefr, domain, topic_id)
);

create table public.content_imports (
  id          bigint generated always as identity primary key,
  imported_at timestamptz not null default now(),
  sheet_hash  text,
  added       int not null default 0,
  updated     int not null default 0,
  retired     int not null default 0,
  details     jsonb
);

-- =====================================================================
-- Người dùng và tiến độ (chỉ ghi qua mã server / hàm RPC)
-- =====================================================================

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  xp          bigint not null default 0,
  streak      int not null default 0,
  best_streak int not null default 0,
  last_day    int,                 -- số ngày theo giờ Việt Nam (core/streak.dayNo)
  xp_today    int not null default 0,
  xp_day      int,                 -- ngày VN của xp_today (chặn cày XP)
  created_at  timestamptz not null default now()
);
create unique index profiles_username_idx on public.profiles (lower(username));
create index profiles_xp_idx on public.profiles (xp desc);

create table public.user_word_progress (
  user_id     uuid   not null references public.profiles (id) on delete cascade,
  word_id     bigint not null references public.words (id),
  cefr        text   not null,     -- sao chép từ words khi ghi (lọc theo phạm vi không cần join)
  domain      text   not null,
  level       smallint not null default 0 check (level between 0 and 5),
  bad         smallint not null default 0,
  next_review timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, word_id)
);
create index uwp_scope_due_idx on public.user_word_progress (user_id, cefr, domain, next_review);
create index uwp_due_idx       on public.user_word_progress (user_id, next_review);

-- Bộ đếm có sẵn, cập nhật cùng giao dịch ghi tiến độ. Không có CHECK >= 0: xem apply_round_result.
create table public.user_level_stats (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  cefr     text not null,
  domain   text not null,
  learned  int  not null default 0,   -- số từ có level >= 1
  mastered int  not null default 0,   -- số từ có level >= 3
  primary key (user_id, cefr, domain)
);

-- Chỉ để hiển thị thống kê, không dùng để mở khóa.
create table public.grammar_stats (
  user_id uuid not null references public.profiles (id) on delete cascade,
  level   text not null,
  correct int  not null default 0,
  total   int  not null default 0,
  primary key (user_id, level)
);

create table public.game_scores (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game    text not null,           -- ví dụ blitz:B1
  best    int  not null default 0,
  plays   int  not null default 0,
  primary key (user_id, game)
);
create index game_scores_board_idx on public.game_scores (game, best desc);

create table public.game_rounds (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  game        text not null,
  items       jsonb not null,      -- câu hỏi + đáp án đúng (KHÔNG cho trình duyệt đọc)
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index game_rounds_user_idx on public.game_rounds (user_id, created_at desc);

create table public.level_exams (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  cefr          text not null check (cefr in ('A1','A2','B1','B2','C1','C2')),
  items         jsonb not null,    -- câu hỏi + đáp án đúng (KHÔNG cho trình duyệt đọc)
  started_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  finished_at   timestamptz,
  score_total   numeric,
  score_vocab   numeric,
  score_grammar numeric,
  passed        boolean
);
create index level_exams_user_idx on public.level_exams (user_id, started_at desc);
-- Tối đa một bài chưa kết thúc cho mỗi người (kể cả khi hai request chạy song song).
create unique index level_exams_one_open_idx on public.level_exams (user_id) where finished_at is null;

-- Nguồn DUY NHẤT quyết định cấp nào đã qua / đã mở.
create table public.level_passes (
  user_id   uuid not null references public.profiles (id) on delete cascade,
  cefr      text not null check (cefr in ('A1','A2','B1','B2','C1','C2')),
  passed_at timestamptz not null default now(),
  score     numeric,
  exam_id   uuid references public.level_exams (id),
  primary key (user_id, cefr)
);

create table public.rate_limits (
  key          text not null,      -- ví dụ play-start:<user>, login:<ip>
  window_start timestamptz not null,
  count        int  not null default 0,
  primary key (key, window_start)
);
