-- name: Quay lại trong 7 ngày (theo tuần bắt đầu)
-- dashboard: activity
-- display: table
-- size: 12x7
-- Chỉ tính người đã bắt đầu từ 7 ngày trở lên (người mới hơn chưa đủ thời gian để quay lại).
-- Với 10–15 người, mỗi tuần chỉ vài người: đọc số người, đừng chỉ nhìn tỉ lệ.
select cohort_week,
       count(*) as learners,
       count(*) filter (where returned_7d) as returned,
       round(count(*) filter (where returned_7d)::numeric / count(*), 4) as return_rate
  from analytics.user_cohorts
 where cohort_age_days >= 7
 group by cohort_week
 order by cohort_week desc
