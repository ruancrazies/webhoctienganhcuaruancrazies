-- name: Số ngày học trước và sau, từng người
-- dashboard: effect
-- display: table
-- size: 12x9
-- Ngày học = ngày có ít nhất một câu trả lời. Người không còn học sau mốc vẫn có dòng (active_days_after = 0).
select intervention, user_ref, active_days_before, active_days_after,
       active_days_after - active_days_before as delta, answers_before, answers_after
  from analytics.effect_by_user
 order by intervention, delta desc
