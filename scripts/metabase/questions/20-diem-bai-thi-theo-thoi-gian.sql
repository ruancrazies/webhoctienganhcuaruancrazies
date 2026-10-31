-- name: Điểm bài thi theo thời gian (trung bình tuần)
-- dashboard: level
-- display: line
-- size: 12x7
-- graph.dimensions: week
-- graph.metrics: avg_exam,avg_practice
select date_trunc('week', day)::date as week,
       round(avg(total) filter (where kind = 'exam'), 4)     as avg_exam,
       round(avg(total) filter (where kind = 'practice'), 4) as avg_practice,
       count(*) as scores
  from analytics.exam_scores
 where day >= (now() at time zone 'Asia/Ho_Chi_Minh')::date - 180
 group by 1
 order by 1
