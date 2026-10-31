-- name: Độ dài phiên trung vị (phút, 30 ngày)
-- dashboard: activity
-- display: line
-- size: 12x7
-- graph.dimensions: day
-- graph.metrics: median_minutes
-- Chỉ tính (người, ngày) có từ 2 sự kiện hoạt động trở lên; phiên một sự kiện không đo được độ dài.
select day,
       round((percentile_cont(0.5) within group (order by session_minutes))::numeric, 1) as median_minutes,
       count(*) as learner_days
  from analytics.activity_daily
 where session_minutes is not null
   and day >= (now() at time zone 'Asia/Ho_Chi_Minh')::date - 30
 group by day
 order by day
