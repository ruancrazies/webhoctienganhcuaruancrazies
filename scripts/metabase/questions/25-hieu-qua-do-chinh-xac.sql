-- name: Độ chính xác trước và sau, từng người
-- dashboard: effect
-- display: table
-- size: 12x9
-- Chỉ người có ≥ 10 câu ở cả hai phía. user_ref là băm một chiều, không hiện danh tính.
select intervention, user_ref, answers_before, accuracy_before, answers_after, accuracy_after,
       round(accuracy_after - accuracy_before, 4) as delta
  from analytics.effect_by_user
 where accuracy_before is not null and accuracy_after is not null
 order by intervention, delta desc
