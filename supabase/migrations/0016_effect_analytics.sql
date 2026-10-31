-- 0016_effect_analytics.sql — Giai đoạn 4 của thiết kế phân tích dữ liệu: đo hiệu quả gợi ý và AI (so sánh trước/sau theo từng người).
--
--   (0) SỬA LỖI của 0014: metabase_ro phải gọi được analytics_private.user_ref() thì các view có user_ref mới đọc được
--   (1) analytics_private.interventions   (tuỳ chọn) ghi đè thời điểm bắt đầu của từng can thiệp; mặc định suy ra từ dữ liệu
--   (2) analytics_private.sign_test_p()    kiểm định dấu hai phía (đúng, không xấp xỉ) cho số người cải thiện / xấu đi
--   (3) analytics.intervention_windows     mốc bắt đầu + cửa sổ "trước" và "sau" bằng nhau cho từng can thiệp
--   (4) analytics.effect_by_user           mỗi (can thiệp, người) một dòng: số liệu trước và sau
--   (5) analytics.effect_summary           tổng hợp: bao nhiêu người cải thiện, trung vị thay đổi, p của kiểm định dấu
--   (6) analytics.ai_coach_usage           số lời nhắn coach AI mỗi ngày (để biết AI có được dùng không)
--
-- Hai can thiệp:
--   'rules' = giai đoạn 2 (gợi ý theo luật + weak-first). Mốc = sự kiện hoạt động đầu tiên (activity_events chưa ai ghi trước giai đoạn 2).
--   'ai'    = giai đoạn 3 (coach AI). Mốc = lời nhắn coach do AI viết đầu tiên (coach_messages).
--
-- Thiết kế (mục 12): ~15 người/ngày thì A/B không đủ ý nghĩa, nên so sánh TRƯỚC/SAU trên từng người. Cửa sổ "trước" và "sau"
-- dài bằng nhau (tối đa 14 ngày, chỉ tính ngày VN đã trọn vẹn), bỏ ngày bắt đầu (ngày chuyển tiếp). Chỉ xét người có câu trả lời ở
-- cửa sổ "trước" (có nền để so sánh); người bỏ hẳn sau đó vẫn được tính (số ngày học sau = 0), nếu không sẽ thiên lệch về người ở lại.
--
-- Không đổi cột nào của các view ở 0013/0014. Không có user_id/username/email; người dùng chỉ là user_ref. View thường (không materialized).
-- Chạy lại an toàn.

-- =====================================================================
-- (0) Sửa lỗi của 0014: view gọi hàm thì NGƯỜI ĐỌC VIEW phải có quyền chạy hàm đó
-- =====================================================================
-- Bảng bên trong view được đọc bằng quyền của chủ view, nhưng hàm gọi trong view thì kiểm quyền theo người truy vấn (tài liệu Postgres,
-- CREATE VIEW). 0014 thu hồi quyền chạy user_ref() của metabase_ro, nên `select * from analytics.activity_daily` (và user_cohorts,
-- user_levels, exam_scores) báo "permission denied for function user_ref". Test cũ chỉ chạy count(*), khi đó hàm bị lược khỏi kế hoạch.
-- Cấp lại đúng mức cần thiết: USAGE trên schema + EXECUTE trên hai hàm. Bảng muối vẫn không đọc được (hàm là SECURITY DEFINER);
-- metabase_ro chỉ băm được user_id mà nó đã biết, mà nó không đọc được user_id nào.
grant usage on schema analytics_private to metabase_ro;
grant execute on function analytics_private.user_ref(uuid) to metabase_ro;

-- =====================================================================
-- (1) Ghi đè mốc bắt đầu (tuỳ chọn)
-- =====================================================================
create table if not exists analytics_private.interventions (
  intervention text        primary key check (intervention in ('rules', 'ai')),
  started_at   timestamptz not null,
  note         text
);
alter table analytics_private.interventions enable row level security;
revoke all on analytics_private.interventions from public, anon, authenticated;

-- =====================================================================
-- (2) Kiểm định dấu hai phía: p = min(1, 2 · P(X ≤ min(up, down))), X ~ Binomial(up + down, 0.5)
-- =====================================================================
-- Người không đổi (hiệu = 0) bị loại khỏi phép thử, theo quy ước của kiểm định dấu. NULL khi không có ai đổi.
create or replace function analytics_private.sign_test_p(p_up int, p_down int) returns numeric
language plpgsql immutable set search_path = pg_catalog as $$
declare
  n    int := coalesce(p_up, 0) + coalesce(p_down, 0);
  m    int := least(coalesce(p_up, 0), coalesce(p_down, 0));
  term numeric;
  cdf  numeric := 0;
begin
  if n = 0 then return null; end if;
  term := power(0.5::numeric, n);              -- P(X = 0)
  for i in 0..m loop
    cdf  := cdf + term;
    term := term * (n - i) / (i + 1);          -- P(X = i + 1) từ P(X = i)
  end loop;
  return least(1::numeric, round(2 * cdf, 4));
end $$;
revoke all on function analytics_private.sign_test_p(int, int) from public, anon, authenticated;
grant execute on function analytics_private.sign_test_p(int, int) to metabase_ro;   -- hàm thuần; view effect_summary gọi nó (xem mục 0)

-- =====================================================================
-- (3) Mốc và cửa sổ
-- =====================================================================
-- window_days = min(14, số ngày VN đã trọn vẹn sau ngày bắt đầu). ready = đủ ≥ 7 ngày để đọc số (dưới đó chỉ để xem trước).
-- Cửa sổ "trước": [start_day − window_days, start_day − 1]; "sau": [start_day + 1, start_day + window_days].
create view analytics.intervention_windows as
with src as (
  select 'rules'::text as intervention,
         coalesce((select i.started_at from analytics_private.interventions i where i.intervention = 'rules'),
                  (select min(at) from public.activity_events)) as started_at
  union all
  select 'ai',
         coalesce((select i.started_at from analytics_private.interventions i where i.intervention = 'ai'),
                  (select min(created_at) from public.coach_messages where source = 'ai'))
),
d as (
  select intervention, started_at,
         (started_at at time zone 'Asia/Ho_Chi_Minh')::date as start_day,
         (now() at time zone 'Asia/Ho_Chi_Minh')::date       as today
    from src where started_at is not null
)
select intervention, started_at, start_day,
       least(14, greatest(today - start_day - 1, 0)) as window_days,
       least(14, greatest(today - start_day - 1, 0)) >= 7 as ready
  from d;

-- =====================================================================
-- (4) Theo từng người
-- =====================================================================
--   accuracy_*      chỉ có khi ≥ 10 câu ở phía đó (ít hơn thì tỉ lệ quá nhiễu)
--   active_days_*   số ngày VN có ít nhất một câu trả lời (không dùng activity_events: trước giai đoạn 2 nó không tồn tại, so sánh sẽ lệch)
--   abandon_*       tỉ lệ vòng bỏ dở, chỉ có khi ≥ 3 vòng mở ở phía đó
--   practice_*      điểm trung bình các bài kiểm tra thường xuyên (thang 0..1), NULL nếu phía đó không có bài nào
--   coach_days_after  số lời nhắn coach AI trong cửa sổ "sau"; exposed (chỉ với 'ai') = đã nhận ≥ 3 lời nhắn. 'rules' áp dụng cho mọi người.
--   Vì "đã nhận coach" liên quan tới việc mở app, nhóm exposed / not_exposed KHÔNG phải nhóm đối chứng ngẫu nhiên: xem docs/buoc-4-do-hieu-qua.md.
create view analytics.effect_by_user as
with daily as (
  select w.intervention, w.window_days, w.ready, a.user_ref, a.day, a.answers, a.correct, a.rounds_started, a.rounds_abandoned,
         case when a.day between w.start_day - w.window_days and w.start_day - 1 then 'before'
              when a.day between w.start_day + 1 and w.start_day + w.window_days then 'after' end as period
    from analytics.intervention_windows w
    join analytics.activity_daily a on a.day between w.start_day - w.window_days and w.start_day + w.window_days
),
agg as (
  select intervention, window_days, ready, user_ref,
         coalesce(sum(answers) filter (where period = 'before'), 0)::int          as answers_before,
         coalesce(sum(answers) filter (where period = 'after'),  0)::int          as answers_after,
         coalesce(sum(correct) filter (where period = 'before'), 0)::int          as correct_before,
         coalesce(sum(correct) filter (where period = 'after'),  0)::int          as correct_after,
         count(*) filter (where period = 'before' and answers > 0)::int           as active_days_before,
         count(*) filter (where period = 'after'  and answers > 0)::int           as active_days_after,
         coalesce(sum(rounds_started)   filter (where period = 'before'), 0)::int as rounds_before,
         coalesce(sum(rounds_started)   filter (where period = 'after'),  0)::int as rounds_after,
         coalesce(sum(rounds_abandoned) filter (where period = 'before'), 0)::int as abandoned_before,
         coalesce(sum(rounds_abandoned) filter (where period = 'after'),  0)::int as abandoned_after
    from daily
   where period is not null
   group by 1, 2, 3, 4
),
prac as (
  select w.intervention, s.user_ref,
         avg(s.total) filter (where s.day between w.start_day - w.window_days and w.start_day - 1) as practice_before,
         avg(s.total) filter (where s.day between w.start_day + 1 and w.start_day + w.window_days) as practice_after
    from analytics.intervention_windows w
    join analytics.exam_scores s on s.kind = 'practice' and s.day between w.start_day - w.window_days and w.start_day + w.window_days
   group by 1, 2
),
coach as (
  select w.intervention, analytics_private.user_ref(c.user_id) as user_ref, count(*)::int as coach_days_after
    from analytics.intervention_windows w
    join public.coach_messages c
      on c.source = 'ai'
     and (c.created_at at time zone 'Asia/Ho_Chi_Minh')::date between w.start_day + 1 and w.start_day + w.window_days
   group by 1, 2
)
select g.intervention, g.window_days, g.ready, g.user_ref,
       g.answers_before, g.answers_after, g.correct_before, g.correct_after,
       case when g.answers_before >= 10 then round(g.correct_before::numeric / g.answers_before, 4) end as accuracy_before,
       case when g.answers_after  >= 10 then round(g.correct_after::numeric  / g.answers_after,  4) end as accuracy_after,
       g.active_days_before, g.active_days_after,
       g.rounds_before, g.rounds_after, g.abandoned_before, g.abandoned_after,
       case when g.rounds_before >= 3 then round(g.abandoned_before::numeric / g.rounds_before, 4) end as abandon_before,
       case when g.rounds_after  >= 3 then round(g.abandoned_after::numeric  / g.rounds_after,  4) end as abandon_after,
       round(p.practice_before, 4) as practice_before,
       round(p.practice_after, 4)  as practice_after,
       coalesce(c.coach_days_after, 0) as coach_days_after,
       case when g.intervention = 'ai' then coalesce(c.coach_days_after, 0) >= 3 else true end as exposed
  from agg g
  left join prac  p on p.intervention = g.intervention and p.user_ref = g.user_ref
  left join coach c on c.intervention = g.intervention and c.user_ref = g.user_ref
 where g.answers_before > 0;

-- =====================================================================
-- (5) Tổng hợp
-- =====================================================================
-- Mỗi (can thiệp, nhóm, chỉ số) một dòng. delta = sau − trước, theo từng người; chỉ người có số liệu ở cả hai phía.
--   improved / worsened tính theo hướng "tốt hơn" của chỉ số (better_if); unchanged = delta đúng bằng 0.
--   sign_test_p: kiểm định dấu hai phía trên improved / worsened. Với vài người, p lớn là bình thường: số liệu chỉ để tham khảo.
create view analytics.effect_summary as
with m as (
  select e.intervention,
         case when e.exposed then 'exposed' else 'not_exposed' end as exposure,
         e.window_days, e.ready, v.metric, v.better_if, v.delta
    from analytics.effect_by_user e
   cross join lateral (values
     ('accuracy',       'higher', e.accuracy_after - e.accuracy_before),
     ('active_days',    'higher', (e.active_days_after - e.active_days_before)::numeric),
     ('answers',        'higher', (e.answers_after - e.answers_before)::numeric),
     ('abandon_rate',   'lower',  e.abandon_after - e.abandon_before),
     ('practice_score', 'higher', e.practice_after - e.practice_before)
   ) as v(metric, better_if, delta)
   where v.delta is not null
),
s as (
  select intervention, exposure, metric, better_if, window_days, ready,
         count(*)::int as users,
         (count(*) filter (where case when better_if = 'higher' then delta > 0 else delta < 0 end))::int as improved,
         (count(*) filter (where delta = 0))::int as unchanged,
         (count(*) filter (where case when better_if = 'higher' then delta < 0 else delta > 0 end))::int as worsened,
         round((percentile_cont(0.5) within group (order by delta))::numeric, 4) as median_delta,
         round(avg(delta), 4) as mean_delta
    from m
   group by 1, 2, 3, 4, 5, 6
)
select s.*, analytics_private.sign_test_p(s.improved, s.worsened) as sign_test_p from s;

-- =====================================================================
-- (6) Mức dùng coach AI theo ngày (giờ VN). Chỉ số đếm.
-- =====================================================================
create view analytics.ai_coach_usage as
select (created_at at time zone 'Asia/Ho_Chi_Minh')::date as day,
       count(*)::int as messages,
       count(distinct user_id)::int as users
  from public.coach_messages
 where source = 'ai'
 group by 1;

grant select on analytics.intervention_windows, analytics.effect_by_user, analytics.effect_summary, analytics.ai_coach_usage to metabase_ro;

comment on view analytics.intervention_windows is 'Mốc bắt đầu và cửa sổ trước/sau bằng nhau (tối đa 14 ngày VN trọn vẹn) cho hai can thiệp: rules (giai đoạn 2) và ai (giai đoạn 3). ready = đủ ≥ 7 ngày.';
comment on view analytics.effect_by_user is 'Mỗi (can thiệp, người có câu trả lời ở cửa sổ trước) một dòng: số liệu trước và sau. Người là user_ref băm một chiều.';
comment on view analytics.effect_summary is 'Tổng hợp trước/sau: số người cải thiện / không đổi / xấu đi, trung vị thay đổi, p của kiểm định dấu hai phía. Không có nhóm đối chứng ngẫu nhiên.';
comment on view analytics.ai_coach_usage is 'Số lời nhắn coach do AI viết mỗi ngày (giờ VN) và số người nhận.';
comment on column analytics.effect_by_user.exposed is 'ai: đã nhận ≥ 3 lời nhắn coach trong cửa sổ sau (không phải nhóm đối chứng ngẫu nhiên). rules: luôn true.';
