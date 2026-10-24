# Bước 5b: 10 trò chơi + màn chơi

File mới / sửa so với 5a (giải nén đè lên thư mục dự án):
- `src/app/(app)/play/[game]/page.tsx`   trang chơi `/play/<trò>?cefr=A1&domain=general` (hoặc `&topic=<slug>`); kiểm tra khóa cấp, trò chỉ-theo-cấp
- `src/games/shell/GameRunner.tsx`       khung chung: màn bắt đầu → gọi `/api/play/start` → chơi → `/api/play/finish` → kết quả
- `src/games/shell/StepGame.tsx`         khung cho trò làm lần lượt từng câu (tiến độ, Tiếp, Chưa biết, phím tắt)
- `src/games/shell/ResultView.tsx`       màn kết quả: XP, chuỗi ngày, bảng Blitz, danh sách "cần ôn lại"
- `src/games/shell/types.ts`, `games.css`
- `src/games/{quiz,blitz,type,scramble,cloze,listen,match,flash,build,tf}.tsx`
- `src/games/registry.ts`                `ready: true` cho cả 10 trò

Không sửa server, API, core hay test.

## Hành vi cần biết
- Server không gửi đáp án xuống trình duyệt nên các trò chấm trên server (quiz, type, cloze, listen, scramble, build, tf, blitz)
  **không báo đúng/sai từng câu**; kết quả và câu sai hiện ở màn cuối. Riêng `match` và `flash` có cả hai mặt nên báo ngay.
- "Chưa biết" gửi giá trị `—` (luôn bị chấm sai, từ vào danh sách ôn). Không có nút "bỏ qua" vì câu không trả lời sẽ không tính SRS.
- Chống nộp quá nhanh: trước khi gọi `play/finish`, shell tự chờ cho đủ `minSecondsPerAnswer × số câu` (tính từ lúc nhận vòng), nên không gặp `TOO_FAST`.
- Blitz: đếm ngược 60 giây theo đồng hồ trình duyệt; combo/mạng/điểm do server tính khi nộp (trình duyệt không biết đúng sai).
- `listen` cần `speechSynthesis`; trình duyệt không hỗ trợ thì nút Bắt đầu bị khóa kèm thông báo.
- Phím tắt: 1–9 chọn đáp án (quiz/listen/cloze/blitz), Enter = Tiếp, scramble gõ chữ trực tiếp + Backspace, flash ←/→.
