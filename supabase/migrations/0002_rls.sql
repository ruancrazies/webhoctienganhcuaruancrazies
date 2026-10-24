-- 0002_rls.sql — RLS bật trên MỌI bảng (lớp phòng thủ thứ hai, ADR-1) và thu hẹp quyền.
-- Trình duyệt không ghi được bảng nào; mọi thao tác đi qua mã server dùng service_role.

alter table public.domains            enable row level security;
alter table public.topics             enable row level security;
alter table public.words              enable row level security;
alter table public.word_topics        enable row level security;
alter table public.sentences          enable row level security;
alter table public.sentence_words     enable row level security;
alter table public.grammar_questions  enable row level security;
alter table public.content_stats      enable row level security;
alter table public.content_imports    enable row level security;
alter table public.profiles           enable row level security;
alter table public.user_word_progress enable row level security;
alter table public.user_level_stats   enable row level security;
alter table public.grammar_stats      enable row level security;
alter table public.game_scores        enable row level security;
alter table public.game_rounds        enable row level security;
alter table public.level_exams        enable row level security;
alter table public.level_passes       enable row level security;
alter table public.rate_limits        enable row level security;

-- Thu hẹp quyền mặc định của Supabase (mặc định cấp rộng cho anon/authenticated).
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ---- Nội dung: chỉ đọc cho người đã đăng nhập ----
-- Không cấp grammar_questions (chứa đáp án; đề thi lấy câu từ bảng này) — khác mục 3.3 một chút để khớp ADR-1/ADR-8.
grant select on public.domains, public.topics, public.words, public.word_topics,
                public.sentences, public.sentence_words, public.content_stats to authenticated;

create policy domains_read        on public.domains        for select to authenticated using (true);
create policy topics_read         on public.topics         for select to authenticated using (true);
create policy words_read          on public.words          for select to authenticated using (status = 'active');
create policy word_topics_read    on public.word_topics    for select to authenticated using (true);
create policy sentences_read      on public.sentences      for select to authenticated using (status = 'active');
create policy sentence_words_read on public.sentence_words for select to authenticated using (true);
create policy content_stats_read  on public.content_stats  for select to authenticated using (true);

-- ---- Người dùng: chỉ đọc dòng của chính mình ----
grant select on public.profiles, public.user_word_progress, public.user_level_stats,
                public.grammar_stats, public.game_scores, public.level_passes to authenticated;

create policy profiles_own   on public.profiles           for select to authenticated using (id = auth.uid());
create policy uwp_own        on public.user_word_progress for select to authenticated using (user_id = auth.uid());
create policy uls_own        on public.user_level_stats   for select to authenticated using (user_id = auth.uid());
create policy gstats_own     on public.grammar_stats      for select to authenticated using (user_id = auth.uid());
create policy gscores_own    on public.game_scores        for select to authenticated using (user_id = auth.uid());
create policy lpasses_own    on public.level_passes       for select to authenticated using (user_id = auth.uid());

-- game_rounds, level_exams (chứa đáp án), rate_limits, content_imports, grammar_questions:
-- KHÔNG có grant và KHÔNG có policy cho anon/authenticated → chỉ service_role truy cập được.
