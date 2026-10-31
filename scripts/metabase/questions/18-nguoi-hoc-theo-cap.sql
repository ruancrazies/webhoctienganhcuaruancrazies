-- name: Số người ở từng cấp (đang học)
-- dashboard: level
-- display: bar
-- size: 12x7
-- graph.dimensions: current_level
-- graph.metrics: learners
-- Cấp đang học = cấp đầu tiên có bài thi mà chưa qua; qua hết A1–C1 thì C2.
select current_level, count(*) as learners
  from analytics.user_levels
 group by current_level
 order by current_level
