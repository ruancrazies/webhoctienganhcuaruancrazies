-- name: Lời nhắn coach AI mỗi ngày (30 ngày)
-- dashboard: effect
-- display: bar
-- size: 12x7
-- graph.dimensions: day
-- graph.metrics: messages
select day, messages, users
  from analytics.ai_coach_usage
 where day >= (now() at time zone 'Asia/Ho_Chi_Minh')::date - 30
 order by day
