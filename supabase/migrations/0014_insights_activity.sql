-- 0014_insights_activity.sql — Giai đoạn 2 của thiết kế phân tích dữ liệu: hồ sơ năng lực, gợi ý, dashboard hoạt động và trình độ.
--
--   (1) record_activity()         ghi activity_events kèm session_id tính phía server (nghỉ < 30 phút là cùng phiên)
--   (2) game_response_medians()   trung vị response_ms toàn hệ thống theo game, để so tốc độ từng người (core/insights)
--   (3) analytics_private.user_ref()  băm một chiều có muối của user_id; muối nằm trong analytics_private (metabase_ro không đọc được)
--   (4) analytics.activity_daily, user_cohorts, user_levels, exam_scores, hour_of_day   view cho dashboard "Hoạt động và giữ chân" và "Trình độ chung"
--
-- Không đổi cột nào của các view ở 0013 (hợp đồng với Metabase: chỉ thêm, không sửa). Bảng user_insights đã có từ 0012.
-- View mới là view THƯỜNG (không materialized): dữ liệu một người chỉ vài nghìn dòng nên truy vấn trực tiếp vẫn rẻ, và số liệu luôn mới.

-- =====================================================================
-- (1) record_activity
-- =====================================================================
-- Khoá cố vấn theo người dùng: hai request đồng thời của cùng một người không tách thành hai phiên.
-- props bị chặn ở 2 KB (route gọi với dữ liệu nhỏ; chặn thêm ở đây để bảng không phình nếu có lỗi gọi).
create or replace function public.record_activity(p_user uuid, p_type text, p_props jsonb default '{}'::jsonb)
returns uuid language plpgsql set search_path = public as $$
declare
  v_last_sid uuid;
  v_last_at  timestamptz;
  v_sid      uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 17));

  select session_id, at into v_last_sid, v_last_at
    from activity_events where user_id = p_user order by at desc, id desc limit 1;

  if v_last_sid is not null and v_last_at > now() - interval '30 minutes' then
    v_sid := v_last_sid;
  else
    v_sid := gen_random_uuid();
  end if;

  insert into activity_events (user_id, session_id, type, props)
  values (p_user, v_sid, left(p_type, 40),
          case when p_props is null or jsonb_typeof(p_props) <> 'object' or length(p_props::text) > 2000 then '{}'::jsonb else p_props end);
  return v_sid;
end $$;

revoke all on function public.record_activity(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_activity(uuid, text, jsonb) to service_role;

-- =====================================================================
-- (2) game_response_medians — chỉ game có ≥ 30 số đo trong p_days ngày gần nhất
-- =====================================================================
create or replace function public.game_response_medians(p_days int default 90)
returns table (game text, median_ms int, n bigint) language sql stable set search_path = public as $$
  select ae.game,
         round(percentile_cont(0.5) within group (order by ae.response_ms))::int,
         count(ae.response_ms)
    from answer_events ae
   where ae.answered_at >= now() - make_interval(days => greatest(p_days, 1))
     and ae.response_ms is not null
   group by ae.game
  having count(ae.response_ms) >= 30
$$;

revoke all on function public.game_response_medians(int) from public, anon, authenticated;
grant execute on function public.game_response_medians(int) to service_role;

-- =====================================================================
-- (3) user_ref — muối ngẫu nhiên tạo một lần, lưu ở analytics_private
-- =====================================================================
create table if not exists analytics_private.user_salt (
  only_row boolean primary key default true check (only_row),
  salt     text not null default encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'utf8')), 'hex')
);
alter table analytics_private.user_salt enable row level security;
insert into analytics_private.user_salt default values on conflict do nothing;

-- SECURITY DEFINER: thân hàm đọc bảng muối bằng quyền của chủ sở hữu. View trong analytics gọi được hàm này,
-- còn metabase_ro không có USAGE trên schema analytics_private nên không gọi trực tiếp và không đọc được muối.
-- Với 10–15 người dùng, user_ref chỉ giảm lộ vô ý, không ngăn người quản trị đoán ra ai (thiết kế mục 3.3).
create or replace function analytics_private.user_ref(p_user uuid) returns text
language sql stable security definer set search_path = pg_catalog as $$
  select left(encode(sha256(convert_to((select salt from analytics_private.user_salt) || p_user::text, 'utf8')), 'hex'), 16)
$$;
revoke all on function analytics_private.user_ref(uuid) from public, anon, authenticated;

-- =====================================================================
-- (4) View cho dashboard
-- =====================================================================

-- Mỗi (ngày giờ Việt Nam, người) một dòng: số câu, số phiên, số vòng mở/nộp/bỏ dở.
--   vòng bỏ dở = đã mở quá 1 giờ mà chưa nộp (vòng vừa mở vẫn còn đang chơi).
--   session_minutes: khoảng cách giữa sự kiện đầu và cuối của ngày (chỉ khi có ≥ 2 sự kiện).
create view analytics.activity_daily as
with a as (
  select (answered_at at time zone 'Asia/Ho_Chi_Minh')::date as day, user_id, count(*) as answers, count(*) filter (where correct) as correct
    from public.answer_events group by 1, 2
),
s as (
  select (at at time zone 'Asia/Ho_Chi_Minh')::date as day, user_id,
         count(distinct session_id) as sessions, count(*) as events,
         case when count(*) >= 2 then round(extract(epoch from (max(at) - min(at))) / 60, 1) end as session_minutes
    from public.activity_events group by 1, 2
),
r as (
  select (created_at at time zone 'Asia/Ho_Chi_Minh')::date as day, user_id,
         count(*) as rounds_started,
         count(*) filter (where finished_at is not null) as rounds_finished,
         count(*) filter (where finished_at is null and created_at < now() - interval '1 hour') as rounds_abandoned
    from public.game_rounds group by 1, 2
),
k as (
  select day, user_id from a union select day, user_id from s union select day, user_id from r
)
select k.day,
       analytics_private.user_ref(k.user_id) as user_ref,
       coalesce(a.answers, 0)          as answers,
       coalesce(a.correct, 0)          as correct,
       coalesce(s.sessions, 0)         as sessions,
       coalesce(s.events, 0)           as events,
       s.session_minutes,
       coalesce(r.rounds_started, 0)   as rounds_started,
       coalesce(r.rounds_finished, 0)  as rounds_finished,
       coalesce(r.rounds_abandoned, 0) as rounds_abandoned
  from k
  left join a on a.day = k.day and a.user_id = k.user_id
  left join s on s.day = k.day and s.user_id = k.user_id
  left join r on r.day = k.day and r.user_id = k.user_id;

-- Mỗi người một dòng: ngày đầu và cuối có hoạt động, số ngày hoạt động, có quay lại trong 7 ngày sau ngày đầu không.
--   returned_7d chỉ có nghĩa khi cohort_age_days ≥ 7 (người mới hơn 7 ngày chưa đủ thời gian để quay lại): lọc ở câu hỏi.
create view analytics.user_cohorts as
with d as (
  select user_id, day from (
    select user_id, (answered_at at time zone 'Asia/Ho_Chi_Minh')::date as day from public.answer_events
    union select user_id, (at at time zone 'Asia/Ho_Chi_Minh')::date from public.activity_events
    union select user_id, (created_at at time zone 'Asia/Ho_Chi_Minh')::date from public.game_rounds
  ) x group by user_id, day
),
agg as (
  select user_id, min(day) as first_day, max(day) as last_day, count(*) as active_days from d group by user_id
)
select analytics_private.user_ref(g.user_id) as user_ref,
       g.first_day, g.last_day, g.active_days,
       date_trunc('week', g.first_day)::date as cohort_week,
       ((now() at time zone 'Asia/Ho_Chi_Minh')::date - g.first_day) as cohort_age_days,
       exists (select 1 from d where d.user_id = g.user_id and d.day > g.first_day and d.day <= g.first_day + 7) as returned_7d
  from agg g;

-- Mỗi người một dòng: cấp đang học (cấp đầu tiên có bài thi mà chưa qua; qua hết A1–C1 thì C2) và số cấp đã qua.
create view analytics.user_levels as
select analytics_private.user_ref(p.id) as user_ref,
       coalesce(
         (select c from unnest(array['A1', 'A2', 'B1', 'B2', 'C1']) as c
           where not exists (select 1 from public.level_passes lp where lp.user_id = p.id and lp.cefr = c)
           order by c limit 1),
         'C2') as current_level,
       (select count(*) from public.level_passes lp where lp.user_id = p.id) as passed_levels,
       (p.created_at at time zone 'Asia/Ho_Chi_Minh')::date as joined_day
  from public.profiles p;

-- Điểm các bài đã nộp (thi lên cấp và kiểm tra thường xuyên), thang 0..1. reading/listening NULL = đề không có phần đó.
-- Bài hết giờ không có điểm nên không có ở đây.
create view analytics.exam_scores as
select 'exam'::text as kind, analytics_private.user_ref(user_id) as user_ref, cefr, passed,
       finished_at, (finished_at at time zone 'Asia/Ho_Chi_Minh')::date as day,
       score_total as total, score_vocab as vocab, score_grammar as grammar, score_reading as reading, score_listening as listening
  from public.level_exams where finished_at is not null and score_total is not null
union all
select 'practice', analytics_private.user_ref(user_id), null::text, null::boolean,
       finished_at, (finished_at at time zone 'Asia/Ho_Chi_Minh')::date,
       score_total, score_vocab, score_grammar, score_reading, score_listening
  from public.practice_tests where finished_at is not null and score_total is not null;

-- Giờ học trong ngày (giờ Việt Nam) trong 60 ngày gần nhất. Không có người dùng: chỉ là số đếm theo giờ.
create view analytics.hour_of_day as
select extract(hour from answered_at at time zone 'Asia/Ho_Chi_Minh')::int as hour,
       count(*) as answers,
       count(distinct user_id) as users
  from public.answer_events
 where answered_at >= now() - interval '60 days'
 group by 1;

grant select on analytics.activity_daily, analytics.user_cohorts, analytics.user_levels, analytics.exam_scores, analytics.hour_of_day to metabase_ro;

comment on view analytics.activity_daily is 'Mỗi (ngày giờ VN, người) một dòng: số câu, số phiên, số vòng mở / nộp / bỏ dở. Người dùng là user_ref băm một chiều. Luôn mới.';
comment on view analytics.user_cohorts is 'Mỗi người một dòng: ngày đầu / cuối hoạt động, số ngày hoạt động, returned_7d (chỉ có nghĩa khi cohort_age_days ≥ 7).';
comment on view analytics.user_levels is 'Mỗi người một dòng: cấp đang học và số cấp đã qua.';
comment on view analytics.exam_scores is 'Điểm các bài đã nộp (thi lên cấp: kind = exam; kiểm tra thường xuyên: kind = practice), thang 0..1.';
comment on view analytics.hour_of_day is 'Số câu trả lời theo giờ trong ngày (giờ VN), 60 ngày gần nhất.';
comment on column analytics.activity_daily.user_ref is 'Băm một chiều có muối của user_id: đếm được người, không hiện username hay email.';
comment on column analytics.activity_daily.rounds_abandoned is 'Vòng đã mở quá 1 giờ mà chưa nộp.';
