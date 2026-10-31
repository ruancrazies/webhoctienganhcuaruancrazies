-- name: Top từ khó theo game
-- dashboard: hard
-- display: table
-- size: 24x9
-- Cùng một từ nhưng tách theo game (type, quiz, cloze, ...): lọc game để xem game nào làm từ khó.
select content_key, sheet_tab, label as en, vi, pos, cefr, domain, game,
       attempts, users, wrong, wrong_rate, wrong_rate_smoothed, group_wrong_rate, median_response_ms
  from analytics.item_stats
 where kind = 'word' and attempts >= {{min_attempts}} and users >= {{min_users}}
   [[and cefr = {{cefr}}]]
   [[and domain = {{domain}}]]
   [[and pos = {{pos}}]]
   [[and game = {{game}}]]
 order by wrong_rate_smoothed desc, attempts desc
 limit 100
