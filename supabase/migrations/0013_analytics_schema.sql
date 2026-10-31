-- 0013_analytics_schema.sql — Giai đoạn 1a: schema `analytics` cho Metabase (từ và bài khó).
--
-- Metabase (chỉ dành cho quản trị) chỉ đọc schema `analytics` bằng role `metabase_ro`.
-- Schema này chỉ chứa VIEW / MATERIALIZED VIEW tổng hợp từ answer_events (migration 0012). Không bản sao dữ liệu thứ hai.
--
--   analytics.word_stats       theo từ, toàn hệ thống (mọi loại game gộp lại)
--   analytics.item_stats       theo (loại câu, id, game): từ × game, câu ngữ pháp, câu hỏi bài đọc/nghe
--   analytics.group_stats      theo nhóm (part, game, cefr, pos, domain, chủ đề ngữ pháp) khi từng câu chưa đủ mẫu
--   analytics.confusion_pairs  đáp án sai bị chọn nhiều nhất cho từng câu ("cặp dễ nhầm")
--   analytics.content_flags    câu nghi sai nội dung (view trên item_stats)
--   analytics.events_daily     số sự kiện mỗi ngày (kiểm tra thu thập dữ liệu còn chạy)
--   analytics.refresh_status   lần làm mới gần nhất của các materialized view
--
-- Không có `user_id`, username hay email trong bất kỳ view nào. Chưa có `user_ref` (băm một chiều theo người): nó chỉ cần khi
-- có dashboard theo người (giai đoạn 2), thêm lúc đó để giai đoạn này không lộ gì thêm.
--
-- HỢP ĐỒNG VỚI METABASE: đổi tên / xoá cột trong analytics làm hỏng câu hỏi đã lưu. Thêm cột thì an toàn;
-- đổi cấu trúc thì tạo view phiên bản mới (ví dụ word_stats_v2) ở migration riêng.
--
-- Công thức làm mượt tỉ lệ sai ở ĐÂY (SQL, báo cáo toàn hệ thống) khác công thức điểm yếu từng người trong core/insights.ts
-- (TypeScript, giai đoạn 2): hai công thức phục vụ hai mục đích khác nhau.
--
-- Sau migration này, đặt mật khẩu cho role (KHÔNG ghi mật khẩu vào repo): xem docs/metabase.md.

-- =====================================================================
-- Schema
-- =====================================================================
create schema if not exists analytics_private;   -- hàm + nhật ký làm mới; không ai ngoài chủ sở hữu và service_role đọc
create schema if not exists analytics;           -- chỉ view; role metabase_ro đọc

revoke all on schema analytics_private, analytics from public, anon, authenticated;

-- =====================================================================
-- Hàm dùng chung (analytics_private)
-- =====================================================================

-- Tỉ lệ sai đã làm mượt: (sai + k·p0) / (lượt + k).
--   p0 = tỉ lệ sai trung bình của nhóm tương ứng; k = 5 (số "lượt ảo" kéo về trung bình nhóm).
-- Nếu không làm mượt, một từ sai 1/1 lần sẽ đứng đầu bảng xếp hạng.
create or replace function analytics_private.smooth_rate(p_wrong numeric, p_n numeric, p_p0 numeric, p_k numeric default 5)
returns numeric language sql immutable as $$
  select (p_wrong + p_k * coalesce(p_p0, 0)) / nullif(p_n + p_k, 0)
$$;

-- Nhật ký làm mới (để dashboard "sức khoẻ dữ liệu" thấy độ trễ).
create table if not exists analytics_private.refresh_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now()
);
alter table analytics_private.refresh_log enable row level security;

-- =====================================================================
-- analytics.word_stats — theo từ, toàn hệ thống
-- =====================================================================
create materialized view analytics.word_stats as
with e as (
  select ae.user_id, ae.word_id, ae.correct, ae.hint_used, ae.response_ms, ae.answered_at, w.cefr
    from public.answer_events ae
    join public.words w on w.id = ae.word_id
),
p0 as (   -- tỉ lệ sai trung bình theo cấp CEFR: mốc để kéo các từ ít mẫu về
  select cefr, sum((not correct)::int)::numeric / count(*) as p0 from e group by cefr
),
agg as (
  select word_id, cefr,
         count(*)                                         as attempts,
         count(distinct user_id)                          as users,
         count(*) filter (where not correct)              as wrong,
         count(distinct user_id) filter (where not correct) as users_wrong,
         count(*) filter (where hint_used)                as hints,
         count(response_ms)                               as timed,
         percentile_cont(0.5) within group (order by response_ms) as median_ms,
         max(answered_at)                                 as last_at
    from e group by word_id, cefr
)
select w.id                         as word_id,
       w.key                        as content_key,
       w.cefr                       as sheet_tab,      -- tab chứa từ trên Google Sheet (tab từ vựng đặt theo cấp)
       w.en, w.vi, w.pos, w.cefr, w.domain, w.status,
       a.attempts, a.users, a.wrong, a.users_wrong,
       round(a.wrong::numeric / a.attempts, 4)                                   as wrong_rate,
       round(analytics_private.smooth_rate(a.wrong, a.attempts, p0.p0), 4)       as wrong_rate_smoothed,
       round(p0.p0, 4)                                                           as cefr_wrong_rate,
       round(a.hints::numeric / a.attempts, 4)                                   as hint_rate,
       a.timed                                                                   as timed_attempts,
       round(a.median_ms)::int                                                   as median_response_ms,
       a.last_at
  from agg a
  join public.words w on w.id = a.word_id
  left join p0 on p0.cefr = a.cefr;
create unique index word_stats_pk on analytics.word_stats (word_id);

-- =====================================================================
-- analytics.item_stats — theo (kind, item_id, game)
--   kind = word | grammar | passage_question. Câu hỏi bài đọc/nghe của đề tạo trước migration 0012 không có
--   passage_question_id nên không vào đây.
--   strong_*: chỉ tính người học "mạnh" = từ 30 câu đã trả lời trở lên và đúng ≥ 80% tổng thể.
--   (Độ chính xác tổng thể có tính cả câu đang xét; với ≥ 30 câu, sai lệch này không đáng kể.)
-- =====================================================================
create materialized view analytics.item_stats as
with ev0 as (
  select 'word'::text as kind, ae.word_id as item_id, ae.user_id, ae.game, ae.part, ae.cefr,
         ae.correct, ae.hint_used, ae.response_ms, ae.answer_value
    from public.answer_events ae where ae.word_id is not null
  union all
  select 'grammar', ae.grammar_id, ae.user_id, ae.game, ae.part, ae.cefr,
         ae.correct, ae.hint_used, ae.response_ms, ae.answer_value
    from public.answer_events ae where ae.grammar_id is not null
  union all
  select 'passage_question', ae.passage_question_id, ae.user_id, ae.game, ae.part, ae.cefr,
         ae.correct, ae.hint_used, ae.response_ms, ae.answer_value
    from public.answer_events ae where ae.passage_question_id is not null
),
strong as (
  select user_id from public.answer_events
   group by user_id
  having count(*) >= 30 and avg(correct::int) >= 0.8
),
ev as (
  select ev0.*, (s.user_id is not null) as is_strong
    from ev0 left join strong s on s.user_id = ev0.user_id
),
p0 as (   -- mốc làm mượt: tỉ lệ sai trung bình của cùng (loại câu, game, cấp)
  select kind, game, cefr, sum((not correct)::int)::numeric / count(*) as p0 from ev group by kind, game, cefr
),
agg as (
  select kind, item_id, game, part, cefr,
         count(*)                                                    as attempts,
         count(distinct user_id)                                     as users,
         count(*) filter (where not correct)                         as wrong,
         count(*) filter (where not correct and answer_value = '')   as blank,
         count(distinct user_id) filter (where not correct)          as users_wrong,
         count(*) filter (where hint_used)                           as hints,
         count(response_ms)                                          as timed,
         percentile_cont(0.5) within group (order by response_ms)    as median_ms,
         count(*) filter (where is_strong)                           as strong_attempts,
         count(distinct user_id) filter (where is_strong)            as strong_users,
         count(*) filter (where is_strong and not correct)           as strong_wrong
    from ev group by kind, item_id, game, part, cefr
)
select a.kind, a.item_id, a.game, a.part, a.cefr,
       coalesce(w.key, g.key, pq.key)                                           as content_key,
       case a.kind when 'word' then w.cefr
                   when 'grammar' then 'grammar'
                   else 'passage_questions / reading_questions' end            as sheet_tab,
       case a.kind when 'word' then w.en
                   when 'grammar' then left(g.question, 160)
                   else left(pq.question, 160) end                             as label,
       w.vi, w.pos, w.domain, g.topic as grammar_topic, ps.key as passage_key,
       a.attempts, a.users, a.wrong, a.blank, a.users_wrong,
       round(a.wrong::numeric / a.attempts, 4)                                  as wrong_rate,
       round(analytics_private.smooth_rate(a.wrong, a.attempts, p0.p0), 4)      as wrong_rate_smoothed,
       round(p0.p0, 4)                                                          as group_wrong_rate,
       round(a.hints::numeric / a.attempts, 4)                                  as hint_rate,
       a.timed                                                                  as timed_attempts,
       round(a.median_ms)::int                                                  as median_response_ms,
       a.strong_attempts, a.strong_users, a.strong_wrong,
       case when a.strong_attempts > 0 then round(a.strong_wrong::numeric / a.strong_attempts, 4) end as strong_wrong_rate
  from agg a
  left join p0 on p0.kind = a.kind and p0.game = a.game and p0.cefr is not distinct from a.cefr
  left join public.words w              on a.kind = 'word'             and w.id  = a.item_id
  left join public.grammar_questions g  on a.kind = 'grammar'          and g.id  = a.item_id
  left join public.passage_questions pq on a.kind = 'passage_question' and pq.id = a.item_id
  left join public.passages ps          on ps.id = pq.passage_id;
create unique index item_stats_pk on analytics.item_stats (kind, item_id, game);

-- =====================================================================
-- analytics.group_stats — theo nhóm, để có số liệu khi từng câu chưa đủ mẫu
--   Từ vựng nhóm theo (pos, cefr, domain); ngữ pháp theo (cefr, chủ đề ngữ pháp).
-- =====================================================================
create materialized view analytics.group_stats as
with e as (
  select part, game, cefr, pos, domain, grammar_topic, user_id, correct, hint_used, response_ms
    from public.answer_events
),
p0 as (
  select part, game, sum((not correct)::int)::numeric / count(*) as p0 from e group by part, game
)
select e.part, e.game, e.cefr, e.pos, e.domain, e.grammar_topic,
       count(*)                                    as attempts,
       count(distinct e.user_id)                   as users,
       count(*) filter (where not e.correct)       as wrong,
       round(sum((not e.correct)::int)::numeric / count(*), 4)                                         as wrong_rate,
       round(analytics_private.smooth_rate(sum((not e.correct)::int), count(*), max(p0.p0)), 4)        as wrong_rate_smoothed,
       round(max(p0.p0), 4)                                                                            as game_wrong_rate,
       round(count(*) filter (where e.hint_used)::numeric / count(*), 4)                               as hint_rate,
       count(e.response_ms)                        as timed_attempts,
       round(percentile_cont(0.5) within group (order by e.response_ms))::int                          as median_response_ms
  from e join p0 on p0.part = e.part and p0.game = e.game
 group by e.part, e.game, e.cefr, e.pos, e.domain, e.grammar_topic;

-- =====================================================================
-- analytics.confusion_pairs — đáp án SAI bị chọn nhiều nhất cho từng câu (tối đa 5 đáp án mỗi câu)
--   Bỏ qua câu bỏ trống (đã đếm ở item_stats.blank). answer_value/expected là chuỗi lưu lúc làm bài, cắt ≤ 200 ký tự.
-- =====================================================================
create materialized view analytics.confusion_pairs as
with ev as (
  select 'word'::text as kind, ae.word_id as item_id, ae.user_id, ae.game, ae.cefr, ae.expected, ae.answer_value
    from public.answer_events ae
   where ae.word_id is not null and not ae.correct and ae.answer_value <> ''
  union all
  select 'grammar', ae.grammar_id, ae.user_id, ae.game, ae.cefr, ae.expected, ae.answer_value
    from public.answer_events ae
   where ae.grammar_id is not null and not ae.correct and ae.answer_value <> ''
  union all
  select 'passage_question', ae.passage_question_id, ae.user_id, ae.game, ae.cefr, ae.expected, ae.answer_value
    from public.answer_events ae
   where ae.passage_question_id is not null and not ae.correct and ae.answer_value <> ''
),
agg as (
  select kind, item_id, game, cefr, expected, answer_value,
         count(*) as times, count(distinct user_id) as users
    from ev group by kind, item_id, game, cefr, expected, answer_value
),
ranked as (
  select agg.*, row_number() over (partition by kind, item_id, game order by times desc, users desc, answer_value) as rank_in_item
    from agg
)
select r.kind, r.item_id, r.game, r.cefr,
       coalesce(w.key, g.key, pq.key) as content_key,
       case r.kind when 'word' then w.en
                   when 'grammar' then left(g.question, 160)
                   else left(pq.question, 160) end as label,
       r.expected, r.answer_value as chosen, r.times, r.users, r.rank_in_item
  from ranked r
  left join public.words w              on r.kind = 'word'             and w.id  = r.item_id
  left join public.grammar_questions g  on r.kind = 'grammar'          and g.id  = r.item_id
  left join public.passage_questions pq on r.kind = 'passage_question' and pq.id = r.item_id
 where r.rank_in_item <= 5;

-- =====================================================================
-- analytics.content_flags — "cờ nghi vấn nội dung" (view thường trên item_stats)
--   Ngưỡng khởi đầu, chỉnh bằng migration mới sau khi có dữ liệu thật:
--     high_wrong_rate   : ≥ 10 người khác nhau và sai ≥ 80%
--     strong_users_wrong: ≥ 5 người học mạnh và nhóm đó sai ≥ 50%
--   Thường là lỗi nội dung (nghĩa sai, đáp án nhiễu trùng nghĩa, key sai): đưa vào quy trình rà soát Google Sheet.
-- =====================================================================
create view analytics.content_flags as
select s.kind, s.item_id, s.game, s.part, s.cefr, s.content_key, s.sheet_tab, s.label, s.vi, s.grammar_topic, s.passage_key,
       s.attempts, s.users, s.wrong_rate, s.wrong_rate_smoothed,
       s.strong_users, s.strong_attempts, s.strong_wrong_rate,
       case when f.hi and f.strong then 'both'
            when f.hi then 'high_wrong_rate'
            else 'strong_users_wrong' end as flag_reason
  from analytics.item_stats s
  cross join lateral (
    select (s.users >= 10 and s.wrong_rate >= 0.8)                                  as hi,
           (s.strong_users >= 5 and coalesce(s.strong_wrong_rate, 0) >= 0.5)        as strong
  ) f
 where f.hi or f.strong;

-- =====================================================================
-- analytics.events_daily — số sự kiện mỗi ngày (giờ Việt Nam). View thường: luôn mới.
-- =====================================================================
create view analytics.events_daily as
select (answered_at at time zone 'Asia/Ho_Chi_Minh')::date as day,
       source,
       count(*)                    as answers,
       count(distinct user_id)     as users,
       count(*) filter (where correct) as correct,
       count(response_ms)          as with_response_ms
  from public.answer_events
 group by 1, 2;

-- =====================================================================
-- analytics.refresh_status — lần làm mới gần nhất
-- =====================================================================
create view analytics.refresh_status as
select max(at) as last_refresh_at,
       round(extract(epoch from (now() - max(at))) / 3600, 1) as hours_since_refresh
  from analytics_private.refresh_log;

-- =====================================================================
-- Làm mới: gọi analytics_private.refresh_all() (pg_cron mỗi đêm, hoặc chạy tay khi cần số liệu ngay).
-- Làm mới thường (không CONCURRENTLY): khoá vài giây lúc 03:00 giờ Việt Nam, đổi lại không cần chỉ mục duy nhất và rẻ hơn.
-- =====================================================================
create or replace function analytics_private.refresh_all() returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  refresh materialized view analytics.word_stats;
  refresh materialized view analytics.item_stats;
  refresh materialized view analytics.group_stats;
  refresh materialized view analytics.confusion_pairs;
  insert into analytics_private.refresh_log default values;
  delete from analytics_private.refresh_log where at < now() - interval '90 days';
end $$;

revoke all on function analytics_private.refresh_all() from public, anon, authenticated;
grant usage on schema analytics_private to service_role;
grant execute on function analytics_private.refresh_all() to service_role;

-- Lần làm mới đầu = lúc tạo (các materialized view vừa dựng xong, đã có dữ liệu hiện tại).
insert into analytics_private.refresh_log default values;

-- =====================================================================
-- Role chỉ đọc cho Metabase
-- =====================================================================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'metabase_ro') then
    -- Chưa có mật khẩu → chưa đăng nhập được. Đặt mật khẩu ngoài repo (docs/metabase.md).
    create role metabase_ro login noinherit nosuperuser nocreatedb nocreaterole nobypassrls connection limit 5;
  end if;
end $$;

-- Phòng thủ nhiều lớp: chỉ đọc, giới hạn thời gian, không giữ giao dịch treo.
alter role metabase_ro set default_transaction_read_only = on;
alter role metabase_ro set statement_timeout = '60s';
alter role metabase_ro set idle_in_transaction_session_timeout = '60s';

grant usage on schema analytics to metabase_ro;
grant select on all tables in schema analytics to metabase_ro;
alter default privileges in schema analytics grant select on tables to metabase_ro;
-- Không cấp gì trên public, auth, analytics_private. (Các bảng public không có quyền cho PUBLIC;
-- tests/db/analytics-views.test.ts kiểm tra metabase_ro không đọc được bảng nào ngoài analytics.)

-- =====================================================================
-- Lịch làm mới ban đêm: 20:00 UTC = 03:00 giờ Việt Nam. Cần pg_cron (Supabase: Database → Extensions).
-- Nơi không có pg_cron (PGlite khi chạy test, Postgres tự dựng): bỏ qua, ghi NOTICE; làm mới bằng tay hoặc cron ngoài.
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('analytics-refresh', '0 20 * * *', 'select analytics_private.refresh_all()');
  else
    raise notice 'pg_cron không có: chưa đặt lịch làm mới analytics. Chạy tay: select analytics_private.refresh_all();';
  end if;
exception when others then
  raise notice 'Không đặt được lịch pg_cron (%). Bật pg_cron rồi chạy lại phần đặt lịch trong docs/metabase.md.', sqlerrm;
end $$;

-- =====================================================================
-- Mô tả (Metabase đọc comment làm phần mô tả bảng / cột)
-- =====================================================================
comment on materialized view analytics.word_stats is 'Độ khó theo từ, mọi game gộp. Xếp hạng theo wrong_rate_smoothed; lọc attempts ≥ 20 và users ≥ 5. Làm mới mỗi đêm.';
comment on materialized view analytics.item_stats is 'Độ khó theo (loại câu, id, game): so sánh cùng một từ giữa các game, câu ngữ pháp, câu hỏi bài đọc/nghe. Làm mới mỗi đêm.';
comment on materialized view analytics.group_stats is 'Độ khó theo nhóm (part, game, cấp, loại từ, lĩnh vực, chủ đề ngữ pháp) khi từng câu chưa đủ mẫu. Làm mới mỗi đêm.';
comment on materialized view analytics.confusion_pairs is 'Tối đa 5 đáp án SAI bị chọn nhiều nhất cho mỗi câu (cặp dễ nhầm). Làm mới mỗi đêm.';
comment on view analytics.content_flags is 'Câu nghi sai nội dung: sai rất nhiều, hoặc sai nhiều ngay cả ở người học mạnh. Kèm content_key và sheet_tab để tìm trên Google Sheet.';
comment on view analytics.events_daily is 'Số câu trả lời mỗi ngày theo nguồn (round, exam, practice), giờ Việt Nam. Luôn mới.';
comment on view analytics.refresh_status is 'Lần làm mới gần nhất của các materialized view.';

comment on column analytics.word_stats.wrong_rate_smoothed is '(sai + 5·tỉ lệ sai trung bình cấp) / (lượt + 5). Dùng để xếp hạng, không dùng wrong_rate thô.';
comment on column analytics.item_stats.wrong_rate_smoothed is '(sai + 5·tỉ lệ sai trung bình của cùng loại câu, game, cấp) / (lượt + 5). Dùng để xếp hạng.';
comment on column analytics.item_stats.strong_wrong_rate is 'Tỉ lệ sai chỉ tính người học mạnh (≥ 30 câu, đúng ≥ 80% tổng thể).';
comment on column analytics.item_stats.blank is 'Số lượt bỏ trống (tính là sai). Bài thi/kiểm tra mới ghi câu bỏ trống.';
comment on column analytics.word_stats.median_response_ms is 'Trung vị thời gian câu hiện trên màn hình (do trình duyệt báo, tín hiệu mềm). NULL nếu chưa có số đo.';
comment on column analytics.item_stats.median_response_ms is 'Trung vị thời gian trả lời (do trình duyệt báo, tín hiệu mềm).';
