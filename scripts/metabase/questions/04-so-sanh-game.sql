-- name: So sánh game cho cùng một từ
-- dashboard: hard
-- display: table
-- size: 24x8
-- Mỗi cột là tỉ lệ sai thô của từ ở một game (chỉ tính khi ≥ 5 lượt ở game đó). Xếp theo chênh lệch giữa game sai nhiều nhất và ít nhất.
with t as (
  select content_key, label, vi, cefr, pos, game, wrong_rate, attempts, users
    from analytics.item_stats
   where kind = 'word' and attempts >= 5
     [[and cefr = {{cefr}}]]
     [[and domain = {{domain}}]]
     [[and pos = {{pos}}]]
)
select content_key, max(label) as en, max(vi) as vi, max(cefr) as cefr,
       max(wrong_rate) filter (where game = 'quiz')     as quiz,
       max(wrong_rate) filter (where game = 'type')     as type,
       max(wrong_rate) filter (where game = 'cloze')    as cloze,
       max(wrong_rate) filter (where game = 'listen')   as listen,
       max(wrong_rate) filter (where game = 'scramble') as scramble,
       max(wrong_rate) filter (where game = 'blitz')    as blitz,
       max(wrong_rate) - min(wrong_rate)                as spread,
       sum(attempts)                                    as attempts
  from t
 group by content_key
having count(*) >= 2 and sum(attempts) >= {{min_attempts}}
 order by spread desc, attempts desc
 limit 100
