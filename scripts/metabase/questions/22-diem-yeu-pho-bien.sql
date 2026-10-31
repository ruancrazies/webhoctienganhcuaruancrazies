-- name: Điểm yếu phổ biến (nhóm sai nhiều, nhiều người gặp)
-- dashboard: level
-- display: table
-- size: 24x8
-- Nhóm = (phần, game, cấp, loại từ, lĩnh vực, chủ đề ngữ pháp). Xếp theo tỉ lệ sai đã làm mượt; chỉ nhóm có đủ lượt và đủ người.
select part, game, cefr, pos, domain, grammar_topic, attempts, users, wrong_rate, wrong_rate_smoothed
  from analytics.group_stats
 where attempts >= {{min_attempts}} and users >= {{min_users}}
 order by wrong_rate_smoothed desc, attempts desc
 limit 20
