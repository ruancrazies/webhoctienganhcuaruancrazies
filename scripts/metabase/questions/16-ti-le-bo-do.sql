-- name: Tỉ lệ vòng bỏ dở theo tuần
-- dashboard: activity
-- display: line
-- size: 12x7
-- graph.dimensions: week
-- graph.metrics: abandon_rate
-- Vòng bỏ dở = mở quá 1 giờ mà chưa nộp. Tuần hiện tại có thể thấp hơn thực tế vì nhiều vòng chưa đủ 1 giờ tuổi.
select date_trunc('week', day)::date as week,
       sum(rounds_started) as rounds_started,
       sum(rounds_abandoned) as rounds_abandoned,
       round(sum(rounds_abandoned)::numeric / nullif(sum(rounds_started), 0), 4) as abandon_rate
  from analytics.activity_daily
 where day >= (now() at time zone 'Asia/Ho_Chi_Minh')::date - 84
 group by 1
 order by 1
