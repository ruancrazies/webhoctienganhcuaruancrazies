-- name: Câu hỏi bài đọc / bài nghe khó
-- dashboard: hard
-- display: table
-- size: 24x7
select content_key, passage_key, label as question, part, cefr,
       attempts, users, wrong, wrong_rate, wrong_rate_smoothed, group_wrong_rate
  from analytics.item_stats
 where kind = 'passage_question' and attempts >= {{min_attempts}} and users >= {{min_users}}
   [[and cefr = {{cefr}}]]
 order by wrong_rate_smoothed desc, attempts desc
 limit 100
