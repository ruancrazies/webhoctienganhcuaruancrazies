-- name: Top từ khó (mọi game gộp)
-- dashboard: hard
-- display: table
-- size: 24x9
-- Xếp hạng theo tỉ lệ sai đã làm mượt, không dùng tỉ lệ thô (từ sai 1/1 lượt sẽ đứng đầu).
select content_key, sheet_tab, en, vi, pos, cefr, domain,
       attempts, users, wrong, wrong_rate, wrong_rate_smoothed, median_response_ms, hint_rate
  from analytics.word_stats
 where attempts >= {{min_attempts}} and users >= {{min_users}}
   [[and cefr = {{cefr}}]]
   [[and domain = {{domain}}]]
   [[and pos = {{pos}}]]
 order by wrong_rate_smoothed desc, attempts desc
 limit 100
