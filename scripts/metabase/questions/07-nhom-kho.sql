-- name: Nhóm khó (loại từ, lĩnh vực, chủ đề ngữ pháp)
-- dashboard: hard
-- display: table
-- size: 24x8
-- Dùng khi từng câu chưa đủ mẫu: số liệu gộp theo nhóm.
select part, game, cefr, pos, domain, grammar_topic,
       attempts, users, wrong, wrong_rate, wrong_rate_smoothed, game_wrong_rate, median_response_ms
  from analytics.group_stats
 where attempts >= {{min_attempts}} and users >= {{min_users}}
   [[and cefr = {{cefr}}]]
   [[and domain = {{domain}}]]
   [[and pos = {{pos}}]]
   [[and game = {{game}}]]
   [[and grammar_topic = {{topic}}]]
 order by wrong_rate_smoothed desc, attempts desc
 limit 100
