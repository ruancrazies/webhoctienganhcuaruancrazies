-- name: Top câu ngữ pháp khó
-- dashboard: hard
-- display: table
-- size: 24x8
select content_key, label as question, grammar_topic, cefr, game,
       attempts, users, wrong, wrong_rate, wrong_rate_smoothed, group_wrong_rate, median_response_ms
  from analytics.item_stats
 where kind = 'grammar' and attempts >= {{min_attempts}} and users >= {{min_users}}
   [[and cefr = {{cefr}}]]
   [[and grammar_topic = {{topic}}]]
   [[and game = {{game}}]]
 order by wrong_rate_smoothed desc, attempts desc
 limit 100
