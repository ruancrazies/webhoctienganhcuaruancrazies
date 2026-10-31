# Bước 0: thu thập dữ liệu trả lời và bài làm

Giai đoạn 0 của `Thiết kế tích hợp phân tích dữ liệu và AI cá nhân hoá`. Chỉ **thu thập**, chưa có dashboard, `/insights`, `/results` hay AI.
Làm trước vì dữ liệu cũ không backfill được.

## Đã làm gì
- Mỗi câu đã trả lời ở vòng chơi, bài thi lên cấp và bài kiểm tra để lại **một dòng** trong `answer_events`.
- Bài thi và bài kiểm tra lưu thêm **đáp án đã chọn** vào cột `answers` (để sau này làm trang xem lại bài).
- Trình duyệt đo và gửi `responseMs` (thời gian câu hiện trên màn hình) cho từng câu.
- Ghi cùng giao dịch với điểm trong 3 RPC nộp bài, nên nộp hai lần không ghi trùng.

## File mới / sửa (giải nén đè lên thư mục dự án)
Mới:
- `supabase/migrations/0012_analytics_events.sql`   bảng `answer_events`, `activity_events`, `user_insights`; cột `answers`; hàm `record_answer_events`; thay 3 RPC
- `src/core/events.ts`                              hàm thuần dựng sự kiện / bài làm từ kết quả chấm
- `src/core/dwell.ts`                               đồng hồ "câu hiện trên màn hình" (hàm thuần, test được)
- `src/lib/useDwell.ts`                             hook nối đồng hồ với `visibilitychange` (bỏ tab thì dừng)
- `tests/core/events.test.ts`, `tests/db/analytics-events.test.ts`

Sửa:
- `src/core/types.ts`             `Answer.responseMs`, `StoredItem.passageQuestionId`
- `src/core/passages.ts`          ghi `passageQuestionId` vào câu hỏi bài đọc/nghe
- `src/types/api.ts`              `answerSchema.responseMs`
- `src/server/repo/{rounds,exams,practice}.ts`          payload RPC thêm `events` (và `answers`)
- `src/server/services/{finishRound,exam,practice}.ts`  dựng events/answers khi nộp
- `src/games/shell/{StepGame,GameRunner}.tsx`, `src/games/{blitz,flash}.tsx`
- `src/app/(app)/exam/[cefr]/ExamRunner.tsx`, `src/app/(app)/test/TestRunner.tsx`

## Triển khai
1. Chạy migration: `npx supabase db push` (hoặc `npx supabase db reset` ở local).
2. Deploy code. **Thứ tự nào cũng an toàn**: RPC mới chạy được với payload cũ (không có `events`), RPC cũ bỏ qua khóa lạ.
3. Chạy lại test: `npm test` (không cần Supabase). `npm run test:api` vẫn chỉ chạy trên Supabase local và chưa có assertion cho bước này.

Kiểm tra sau khi chơi thử một vòng, một bài kiểm tra, một bài thi:

```sql
select source, count(*) as cau, count(response_ms) as co_thoi_gian
  from answer_events group by source;

select qid, game, part, cefr, domain, pos, grammar_topic, correct, near, answer_value, expected, response_ms
  from answer_events order by id desc limit 20;

select id, jsonb_array_length(answers) as so_cau from level_exams    where answers is not null order by started_at desc limit 3;
select id, jsonb_array_length(answers) as so_cau from practice_tests where answers is not null order by started_at desc limit 3;
```

## Quy ước dữ liệu cần biết
- **Chỉ ghi câu đã trả lời** ở vòng chơi (câu chưa tới ở Blitz, câu bỏ qua không phải câu sai). Bài thi/kiểm tra ghi **mọi câu**, câu bỏ trống tính sai với `answer_value = ''`.
- **Nhãn** `cefr`, `domain`, `pos`, `grammar_topic` do SQL điền từ bảng nội dung theo `word_id` / `grammar_id` / `passage_id` (một nguồn duy nhất). Nhãn là bản sao tại thời điểm ghi.
- **`correct` của `flash` và `match`**: server không chấm hai trò này (mọi câu nộp đều "đúng" để tính hoàn thành), ghi nguyên sẽ ra 100% đúng và vô nghĩa. Nên ở sự kiện, `correct = true` chỉ khi nhớ/ghép **ngay lần đầu** (`attempts = 0`). `flash` giờ gửi `attempts` = số lần bấm "Chưa nhớ". Điểm và XP không đổi.
- **`response_ms`** là tín hiệu mềm do trình duyệt báo: không dùng cho điểm/XP/xếp hạng. Server kẹp về 0–120.000; thiếu số đo là `NULL`, không phải 0.
  - Trò trắc nghiệm tự chuyển câu: chốt lúc chọn (không tính 320 ms hiệu ứng chờ).
  - Bài thi/kiểm tra (đi lại giữa các câu): tổng thời gian câu hiện trên màn hình qua mọi lần xem. Không tính lúc bỏ tab. Câu đã trả lời trước khi tải lại trang thì không có số đo.
  - `match` chưa đo thời gian (ghép theo cặp, không theo từng câu).
- **`answers`** của bài thi/kiểm tra: `[{qid, value, correct, near}]`, `correct` là kết quả chấm đã đóng băng. Bài làm trước migration, bài bỏ dở và bài hết giờ có `answers = NULL`.
- **`passage_question_id`** (ngoài thiết kế gốc, thêm vì cần để thống kê độ khó từng câu đọc/nghe): chỉ có ở đề tạo sau khi deploy; đề đang làm dở lúc deploy sẽ để trống.
- `activity_events` và `user_insights` đã tạo bảng nhưng **chưa có mã ghi**; thuộc giai đoạn 2.

## Chưa làm (đúng phạm vi bước 0)
Schema `analytics` và Metabase (giai đoạn 1a), API/trang xem lại kết quả (1b), `core/insights.ts` (2), AI (3). Chính sách lưu 12–24 tháng và trang xuất/xóa dữ liệu cá nhân cũng chưa làm.
