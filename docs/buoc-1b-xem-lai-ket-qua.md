# Bước 1b: xem lại kết quả bài kiểm tra

Giai đoạn 1b của `Thiết kế tích hợp phân tích dữ liệu và AI cá nhân hoá`. Dựa trên cột `answers` của bước 0. **Không có migration mới**: chỉ thêm API, trang, component và test.

## Đã làm gì
- `GET /api/results`: danh sách bài đã nộp (thi lên cấp và kiểm tra thường xuyên), mới nhất trước, phân trang keyset, lọc theo loại và cấp.
- `GET /api/results/[type]/[id]`: dựng lại bài từ `items` và `answers`: đề, đáp án đã chọn, đáp án đúng, giải thích, đoạn đọc/nghe, thống kê theo phần.
- `POST /api/results/review`: nút "Ôn lại các từ sai" (hạ `next_review` về hiện tại, như `apply_practice_result`).
- Trang `/results` (lịch sử, biểu đồ điểm theo thời gian, lọc loại/cấp) và `/results/[type]/[id]` (tóm tắt điểm, lọc "tất cả / chỉ câu sai / theo phần", từng câu kèm đáp án của bạn và đáp án đúng, hai nút ở cuối).
- Tách phần hiển thị kết quả thành component dùng chung `AttemptView`: màn hình ngay sau khi nộp (`ExamRunner`, `TestRunner`) và màn hình xem lại giờ dùng cùng một bộ `ScoreSummary` + `AnswerList`.
- Lối vào: màn kết quả sau khi nộp ("Xem lại toàn bộ bài làm"), trang Hồ sơ, trang Kiểm tra. Không thêm tab thứ năm vì thanh tab dưới đang đủ chỗ cho bốn mục; `/results` được tô sáng ở tab Hồ sơ.

## File mới
- `src/core/results.ts`                         hàm thuần: ghép đề với bài làm, thống kê theo phần, phần yếu, con trỏ phân trang
- `src/server/repo/results.ts`                  truy vấn danh sách / chi tiết / hẹn ôn
- `src/server/services/results.ts`              `listResults`, `getResultDetail`, `scheduleWrongWords`
- `src/app/api/results/route.ts`, `src/app/api/results/[type]/[id]/route.ts`, `src/app/api/results/review/route.ts`
- `src/components/AttemptView.tsx`              component kết quả dùng chung
- `src/app/(app)/results/page.tsx`, `ResultsList.tsx`, `[type]/[id]/page.tsx`, `ResultReview.tsx`
- `tests/core/results.test.ts`, `tests/server/results-service.test.ts`, `tests/server/results-repo.test.ts`, `tests/api/results.itest.ts`

## File sửa
- `src/types/api.ts`               kiểu và schema cho results; `ExamResult.resultId`, `PracticeResult.resultId` (tùy chọn)
- `src/server/services/{exam,practice}.ts`   trả thêm `resultId`; `practice.ts` dùng `currentStudyLevel` chung
- `src/server/services/levels.ts`  thêm `currentStudyLevel` (logic cũ của `grammarLevel`, chuyển ra dùng chung)
- `src/server/services/index.ts`, `src/server/repo/index.ts`   export
- `src/app/(app)/exam/[cefr]/ExamRunner.tsx`, `src/app/(app)/test/TestRunner.tsx`   dùng component chung (giao diện giữ nguyên) và thêm liên kết xem lại
- `src/app/(app)/profile/page.tsx`, `src/app/(app)/test/page.tsx`, `src/components/Nav.tsx`   lối vào
- `src/lib/format.ts`, `src/app/app.css`

## Triển khai
Không cần chạy migration. Triển khai code là đủ. Bài làm từ bước 0 trở đi có `answers` nên xem lại được ngay.

## Quyết định ngoài thiết kế gốc
- **Không chấm lại.** Trang xem lại dùng `correct` và `near` đã lưu lúc nộp (thiết kế mục 4.3), nên đổi luật chấm sau này không làm lệch điểm.
- **404 cho mọi bài không phải của bạn.** Bài của người khác, bài chưa nộp, bài không tồn tại đều trả cùng một 404, không lộ bài có tồn tại hay không. Bài đang làm dở không bao giờ trả `items` (đáp án).
- **Bài cũ: `409 NO_DETAIL`.** Bài làm trước bước 0 hoặc bị đóng vì hết giờ vẫn nằm trong danh sách (có điểm) với `hasDetail = false`; nút "Xem chi tiết" được thay bằng ghi chú. Bài kiểm tra thường xuyên hết giờ không có điểm nên không xuất hiện (như `recentPracticeResults`).
- **Lọc theo cấp chỉ áp cho bài thi lên cấp**; bài kiểm tra thường xuyên không có cấp nên bị bỏ khi đang lọc cấp.
- **Con trỏ phân trang giữ chuỗi microsecond của Postgres** (`<finished_at>|<id>`) vì `Date` của JS chỉ có mili-giây. Con trỏ được kiểm dạng chặt trước khi đưa vào bộ lọc PostgREST.
- **"Luyện phần yếu"**: phần có tỉ lệ đúng thấp nhất của bài (hòa thì theo thứ tự từ vựng, ngữ pháp, đọc, nghe). Từ vựng dẫn tới trò Trắc nghiệm, ngữ pháp tới Đúng hay sai, đọc/nghe tới trang Kiểm tra (chưa có trò riêng cho hai phần này). Cấp luyện là cấp của bài thi, hoặc cấp đang học với bài kiểm tra.
- **"Ôn lại các từ sai"** chỉ đụng từ đã học và chưa đến hạn; không đổi `level`, không tạo dòng tiến độ cho từ chưa học. Bấm lại không đổi thêm. Bài kiểm tra thường xuyên đã tự hẹn ôn lúc nộp nên nút này thường báo 0 từ mới được hẹn với loại bài đó. Bài thi lên cấp không đụng SRS lúc nộp (ADR-8) nên nút này mới có tác dụng thật.
- **Đoạn đọc/nghe lấy từ bảng hiện tại**, không chụp lại lúc thi (đúng mục 13 của thiết kế). Nếu nội dung bị sửa trên Sheet thì trang xem lại hiện bản mới. Chưa làm snapshot.
- **Danh sách tải cả cột `answers`** (vài KB mỗi bài, tối đa 50 dòng) để biết `hasDetail`, thay vì thêm cột hay view mới cần migration. Nếu sau này thấy nặng thì thêm cột sinh sẵn `has_answers`.
- **Biểu đồ điểm** chỉ vẽ các bài đã tải trong trang (20 bài mỗi lần), không gọi riêng để lấy toàn bộ lịch sử.

## Chưa làm / chưa kiểm tra
- **Chưa chạy trên Supabase thật.** Môi trường soạn không có Docker/Supabase. Đã kiểm: logic thuần, service với repo giả, và repo với supabase-js thật nhưng `fetch` giả (kiểm đúng URL, cú pháp `or=(...)`, mã hóa dấu `+`, lọc `user_id`). `tests/api/results.itest.ts` (phân trang, phân quyền, hẹn ôn) **chưa chạy**: chạy `npx supabase start` rồi `npm run test:api` để xác nhận.
- Giao diện mới xem qua ảnh chụp ở khổ điện thoại (render tĩnh), chưa bấm thử trong trình duyệt với dữ liệu thật; chưa kiểm tra chế độ tối.
- Ở "Xem lại", chưa phát lại bài nghe (chỉ hiện lời thoại đầy đủ như màn sau khi nộp).
- Xem lại bài chơi game (`game_rounds`) vẫn ngoài phạm vi, như thiết kế mục 14.
