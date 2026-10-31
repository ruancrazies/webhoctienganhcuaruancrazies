-- name: Câu trả lời mỗi ngày (30 ngày)
-- dashboard: health
-- display: line
-- size: 16x7
-- graph.dimensions: day,source
-- graph.metrics: answers
select day, source, answers
  from analytics.events_daily
 where day >= (now() at time zone 'Asia/Ho_Chi_Minh')::date - 30
 order by day
