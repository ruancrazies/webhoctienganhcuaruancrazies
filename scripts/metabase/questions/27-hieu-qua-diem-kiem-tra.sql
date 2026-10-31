-- name: Điểm bài kiểm tra thường xuyên trước và sau
-- dashboard: effect
-- display: table
-- size: 12x7
-- Thang 0..1, trung bình các bài trong mỗi cửa sổ. Chỉ người có bài ở cả hai phía (thường rất ít người).
select intervention, user_ref, practice_before, practice_after,
       round(practice_after - practice_before, 4) as delta
  from analytics.effect_by_user
 where practice_before is not null and practice_after is not null
 order by intervention, delta desc
