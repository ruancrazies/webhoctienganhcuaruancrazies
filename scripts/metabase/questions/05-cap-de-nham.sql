-- name: Cặp dễ nhầm (đáp án sai hay bị chọn nhất)
-- dashboard: hard
-- display: table
-- size: 24x9
-- `expected` là đáp án đúng, `chosen` là đáp án sai người học chọn/gõ. Tối đa 5 đáp án sai mỗi câu.
select content_key, label, game, cefr, expected, chosen, times, users, rank_in_item
  from analytics.confusion_pairs
 where times >= 3
   [[and cefr = {{cefr}}]]
   [[and game = {{game}}]]
 order by times desc, users desc
 limit 100
