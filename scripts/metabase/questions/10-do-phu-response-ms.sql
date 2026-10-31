-- name: Độ phủ số đo thời gian (response_ms) theo ngày
-- dashboard: health
-- display: table
-- size: 24x7
-- Câu thiếu response_ms là NULL, không phải 0. Tỉ lệ thấp bất thường = client không gửi đo được (kiểm tra GameRunner/ExamRunner/TestRunner).
select day, source, answers, users,
       round(100.0 * with_response_ms / nullif(answers, 0), 1) as pct_with_response_ms,
       round(100.0 * correct / nullif(answers, 0), 1)          as pct_correct
  from analytics.events_daily
 where day >= (now() at time zone 'Asia/Ho_Chi_Minh')::date - 14
 order by day desc, source
