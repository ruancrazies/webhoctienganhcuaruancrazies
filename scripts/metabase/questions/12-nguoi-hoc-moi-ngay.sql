-- name: Người học mỗi ngày (30 ngày)
-- dashboard: activity
-- display: line
-- size: 12x7
-- graph.dimensions: day
-- graph.metrics: learners
-- Người học = có ít nhất một câu trả lời, phiên hoặc vòng chơi trong ngày (giờ Việt Nam).
select day, count(distinct user_ref) as learners
  from analytics.activity_daily
 where day >= (now() at time zone 'Asia/Ho_Chi_Minh')::date - 30
 group by day
 order by day
