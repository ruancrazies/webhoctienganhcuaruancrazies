-- name: Trước và sau: tổng hợp theo chỉ số
-- dashboard: effect
-- display: table
-- size: 24x9
-- Mỗi dòng: bao nhiêu người cải thiện / không đổi / xấu đi (theo hướng tốt hơn của chỉ số), trung vị thay đổi (sau − trước)
-- và p của kiểm định dấu hai phía. Với vài người, p lớn là bình thường: chỉ để tham khảo, không phải bằng chứng nhân quả.
select intervention, exposure, metric, better_if, users, improved, unchanged, worsened,
       median_delta, mean_delta, sign_test_p, window_days, ready
  from analytics.effect_summary
 order by intervention, exposure, metric
