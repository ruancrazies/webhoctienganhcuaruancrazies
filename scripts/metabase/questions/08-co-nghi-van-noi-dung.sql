-- name: Cờ nghi vấn nội dung (rà soát Google Sheet)
-- dashboard: hard
-- display: table
-- size: 24x8
-- high_wrong_rate: ≥ 10 người, sai ≥ 80%.  strong_users_wrong: ≥ 5 người học mạnh, nhóm đó sai ≥ 50%.  both: cả hai.
-- Tìm dòng trên Google Sheet theo `sheet_tab` + `content_key` (cột key).
select flag_reason, kind, content_key, sheet_tab, label, vi, game, cefr,
       users, attempts, wrong_rate, strong_users, strong_wrong_rate
  from analytics.content_flags
 where true
   [[and cefr = {{cefr}}]]
   [[and game = {{game}}]]
 order by (flag_reason = 'both') desc, users desc, wrong_rate desc
 limit 200
