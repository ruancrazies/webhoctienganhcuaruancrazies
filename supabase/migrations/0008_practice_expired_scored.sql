-- 0008_practice_expired_scored.sql — Bài kiểm tra thường xuyên hết giờ mà không nộp: VẪN TÍNH là một lần làm.
-- Không có câu trả lời nào được gửi lên nên các câu bỏ trống tính là sai → điểm 0 (giống bài thi lên cấp hết giờ).
-- Bài NỘP TRỄ thì được chấm bình thường (không còn từ chối ở tầng service), nên hàm này chỉ dành cho bài bị bỏ dở.
-- Không hẹn ôn lại từ nào (không có thông tin người dùng sai từ nào).
create or replace function public.fail_practice_test(p_user uuid, p_test uuid) returns boolean
language plpgsql set search_path = public as $$
begin
  update practice_tests
     set finished_at = expires_at, score_total = 0, score_vocab = 0, score_grammar = 0
   where id = p_test and user_id = p_user and finished_at is null;
  return found;
end $$;
