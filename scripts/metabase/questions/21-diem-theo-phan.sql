-- name: Điểm trung bình theo phần (90 ngày)
-- dashboard: level
-- display: table
-- size: 12x7
-- Thang 0..1. Phần đọc / nghe NULL khi đề không có phần đó (đề cũ trước khi có bài đọc/nghe).
select kind,
       count(*) as scores,
       round(avg(vocab), 4)     as vocab,
       round(avg(grammar), 4)   as grammar,
       round(avg(reading), 4)   as reading,
       round(avg(listening), 4) as listening
  from analytics.exam_scores
 where day >= (now() at time zone 'Asia/Ho_Chi_Minh')::date - 90
 group by kind
 order by kind
