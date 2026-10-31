-- 0015_ai_cache.sql — Giai đoạn 3 của thiết kế phân tích dữ liệu: lớp AI (coach hằng ngày, giải thích lỗi).
--
--   (1) coach_messages      lời nhắn coach của MỖI NGƯỜI mỗi ngày (giờ VN). Chỉ lưu bản do AI viết đã qua kiểm tra;
--                           `fingerprint` là dấu vân tay của bộ gợi ý lúc viết: gợi ý đổi thì lời nhắn cũ không còn khớp → viết lại.
--   (2) error_explanations  giải thích lỗi theo (câu, đáp án sai), DÙNG CHUNG giữa mọi người. Khoá là băm sha256 của nội dung
--                           câu hỏi + đáp án sai, nên bảng này KHÔNG có user_id và không chứa gì về người học.
--
-- Cả hai là bảng nội bộ: chỉ service_role (server) đọc/ghi, giống user_insights. Không đụng schema analytics (Metabase không thấy).
-- Chạy lại an toàn (create ... if not exists).

create table if not exists public.coach_messages (
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  day         integer     not null,                        -- core/streak.dayNo (ngày theo giờ VN)
  message     text        not null check (char_length(message) between 1 and 600),
  source      text        not null check (source in ('ai', 'rule')),
  fingerprint text        not null default '' check (char_length(fingerprint) <= 400),
  created_at  timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.error_explanations (
  cache_key   text        primary key check (char_length(cache_key) = 64),
  text        text        not null check (char_length(text) between 1 and 1000),
  created_at  timestamptz not null default now()
);

alter table public.coach_messages     enable row level security;
alter table public.error_explanations enable row level security;
revoke all on public.coach_messages, public.error_explanations from anon, authenticated;
grant  all on public.coach_messages, public.error_explanations to service_role;
