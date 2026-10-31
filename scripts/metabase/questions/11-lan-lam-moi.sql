-- name: Lần làm mới gần nhất của view
-- dashboard: health
-- display: table
-- size: 8x7
-- hours_since_refresh lớn hơn ~26 giờ = lịch pg_cron không chạy.
select last_refresh_at, hours_since_refresh from analytics.refresh_status
