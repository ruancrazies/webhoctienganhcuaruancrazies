-- name: Người học mỗi tuần (12 tuần)
-- dashboard: activity
-- display: bar
-- size: 12x7
-- graph.dimensions: week
-- graph.metrics: learners
select date_trunc('week', day)::date as week, count(distinct user_ref) as learners
  from analytics.activity_daily
 where day >= (now() at time zone 'Asia/Ho_Chi_Minh')::date - 84
 group by 1
 order by 1
