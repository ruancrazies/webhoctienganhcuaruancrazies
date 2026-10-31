-- name: Mốc bắt đầu và cửa sổ so sánh
-- dashboard: effect
-- display: table
-- size: 12x4
-- rules = gợi ý theo luật + weak-first (giai đoạn 2); ai = coach AI (giai đoạn 3). ready = đủ ≥ 7 ngày để đọc số.
-- Cửa sổ trước/sau dài bằng nhau (window_days, tối đa 14 ngày VN trọn vẹn), bỏ ngày bắt đầu.
select intervention, started_at, window_days, ready
  from analytics.intervention_windows
 order by intervention
