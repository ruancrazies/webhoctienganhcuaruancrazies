-- name: Giờ học phổ biến (giờ Việt Nam, 60 ngày)
-- dashboard: activity
-- display: bar
-- size: 12x7
-- graph.dimensions: hour
-- graph.metrics: answers
select hour, answers, users
  from analytics.hour_of_day
 order by hour
