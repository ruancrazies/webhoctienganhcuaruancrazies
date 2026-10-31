-- name: Tỉ lệ qua kỳ thi lên cấp
-- dashboard: level
-- display: table
-- size: 12x7
-- Mỗi dòng một cấp: số lượt thi, số người thi, số lượt qua. Bài hết giờ (điểm 0) không có trong dữ liệu.
select cefr,
       count(*) as attempts,
       count(distinct user_ref) as learners,
       count(*) filter (where passed) as passes,
       round(count(*) filter (where passed)::numeric / count(*), 4) as pass_rate
  from analytics.exam_scores
 where kind = 'exam'
 group by cefr
 order by cefr
