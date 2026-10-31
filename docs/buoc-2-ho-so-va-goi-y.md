# Bước 2: hồ sơ năng lực và gợi ý

Giai đoạn 2 của `Thiết kế tích hợp phân tích dữ liệu và AI cá nhân hoá`. Dựa trên `answer_events` (bước 0) và các trang xem lại (bước 1). **Có migration mới: `0014_insights_activity.sql`.** Chưa có AI: gợi ý chọn bằng luật, câu chữ theo template (giai đoạn 3 mới cho AI diễn đạt lại, vẫn không để AI chọn hành động).

## Đã làm gì
- **Hồ sơ năng lực** (`core/insights.ts`, hàm thuần): từ câu đã trả lời trong 60 ngày gần nhất tính
  - độ chính xác tổng và theo 6 kỹ năng (nhận nghĩa, nhớ/chính tả, ngữ cảnh, nghe, ngữ pháp, đọc hiểu), có trọng số giảm dần theo thời gian (bán rã 14 ngày) và số mẫu kèm theo;
  - xu hướng: 7 ngày gần nhất so với 7 ngày trước (chỉ hiện khi mỗi nửa ≥ 3 câu);
  - điểm yếu: nhóm có ≥ 5 câu và đúng dưới 70%, theo (cấp, loại từ), (cấp, lĩnh vực) và (cấp, chủ đề ngữ pháp), xếp theo `(1 − đúng) × log(1 + số câu) × độ mới`, giữ 5 nhóm;
  - hành vi: giờ hay học (giờ VN), độ dài phiên trung vị, trò hay chơi, tỉ lệ vòng bỏ dở, tốc độ so với trung vị chung cùng game, mức dùng gợi ý, số ngày có học trong 14 ngày, tỉ lệ từ quá hạn;
  - điểm bài kiểm tra gần nhất và bài trước đó, theo phần.
  Kết quả là một JSON `InsightMetrics` lưu ở `user_insights.data`, tính lại sau mỗi lần nộp bài.
- **Gợi ý theo luật** (`buildNextActions`): tối đa 3 hành động, mỗi hành động có mã lý do và số liệu đi kèm. Bảy mã: `due_backlog`, `weak_grammar_topic`, `weak_skill`, `exam_gap`, `ready_for_exam`, `streak_risk`, `long_absence`. Thứ tự ưu tiên cố định; hàm tất định. Gợi ý tính lúc đọc (từ hồ sơ đã lưu + tín hiệu tươi: từ đến hạn, chuỗi ngày, cấp đang học), nên "chuỗi sắp đứt" hay "vắng nhiều ngày" đúng ngay cả khi không ai nộp bài.
- **Weak-first**: khi bắt đầu vòng chơi, từ thuộc nhóm yếu của người học (cùng cấp, và cùng loại từ hoặc lĩnh vực) được xếp lên trước trong từng nguồn (đến hạn / mới / luyện tập), tối đa 60% số chỗ của vòng; vòng `tf` lấy tối đa 60% câu từ chủ đề ngữ pháp yếu. Hồ sơ rỗng hoặc lỗi thì vòng chạy y như cũ.
- **Ghi hoạt động** (`activity_events`, trước đây chưa ai ghi): `play/start`, `play/finish`, `learn/words` (chỉ trang đầu), `learn/mark`, `exam/start`, `exam/submit`, `test/start`, `test/submit`, `quests/claim`, `chat` (chỉ `{pet}`, không ghi nội dung). Phiên tính phía server: nghỉ ≥ 30 phút là phiên mới.
- **Giao diện**: khối "Hôm nay nên học gì" ở trang chủ; trang `/insights` (tổng quan, kỹ năng, điểm cần luyện, thói quen, bài kiểm tra gần nhất); nút vào từ trang Hồ sơ. Người dùng thấy đúng những số mà gợi ý dựa vào.
- **API**: `GET /api/insights/me` (luôn là chính mình, không nhận id). `GET /api/insights/coach` thuộc giai đoạn 3, chưa làm.
- **Dashboard Metabase**: "Hoạt động và giữ chân" (6 câu hỏi) và "Trình độ chung" (5 câu hỏi), thêm vào `scripts/metabase/setup.ts`.

## Migration 0014
- `record_activity(user, type, props)`: ghi `activity_events` kèm `session_id`; khoá cố vấn theo người để hai request song song không tách phiên; `props` > 2 KB hoặc không phải object thì thành `{}`. Chỉ `service_role` gọi được.
- `game_response_medians(days)`: trung vị `response_ms` theo game (chỉ game có ≥ 30 số đo). Chỉ `service_role`.
- `analytics_private.user_salt` + `analytics_private.user_ref(uuid)`: băm một chiều có muối; muối sinh ngẫu nhiên một lần. `SECURITY DEFINER`, `metabase_ro` không có quyền vào schema nên không đọc được muối và không gọi được hàm.
- View mới trong `analytics`: `activity_daily`, `user_cohorts`, `user_levels`, `exam_scores` (có `user_ref`), `hour_of_day` (chỉ số đếm theo giờ). Không đổi cột nào của view ở 0013.

## File mới
- `src/core/skills.ts`, `src/core/insights.ts`
- `supabase/migrations/0014_insights_activity.sql`
- `src/server/repo/insights.ts`, `src/server/services/insights.ts`, `src/server/services/activity.ts`
- `src/app/api/insights/me/route.ts`, `src/app/(app)/insights/page.tsx`, `src/components/TodayActions.tsx`
- `scripts/metabase/questions/12…22-*.sql` (11 câu hỏi)
- `tests/core/insights.test.ts`, `tests/db/analytics-activity.test.ts`, `tests/server/insights-{repo,service}.test.ts`, `tests/server/weak-first-{repo,words}.test.ts`

## File sửa
- `src/server/services/{startRound,finishRound,learn,exam,practice,quests,chat}.ts`: ghi hoạt động; `startRound` dùng weak-first; `finishRound`/`exam`/`practice` làm mới hồ sơ sau khi nộp
- `src/server/services/home.ts`, `src/types/api.ts`: `HomeResponse.actions`, `ActionView`, `InsightsResponse`
- `src/server/repo/{progress,content,index}.ts`: `pickWords`/`pickGrammar` nhận hồ sơ yếu (tham số tuỳ chọn, mặc định giữ hành vi cũ)
- `src/app/(app)/page.tsx`, `src/app/(app)/profile/page.tsx`, `src/app/app.css`
- `scripts/metabase/setup.ts`, `docs/metabase.md`
- `tests/db/analytics-views.test.ts`: cho phép cột `user_ref` ở bốn view theo người (đúng như 0013 đã dự kiến); số file câu hỏi 11 → 22

## Triển khai
1. Chạy migration: `npx supabase db push` (hoặc dán `0014_insights_activity.sql` vào SQL Editor). Chạy lại an toàn: muối chỉ sinh một lần.
2. Triển khai code.
3. Dựng dashboard mới: chạy lại `scripts/metabase/setup.ts` (xem `docs/metabase.md` mục 6).
4. Hồ sơ của mỗi người được tạo ở lần nộp bài đầu tiên sau khi triển khai, hoặc khi họ mở `/insights`. Trước đó trang chủ chỉ có gợi ý theo tín hiệu tươi (từ đến hạn, chuỗi, thiếu từ để thi).

## Quyết định ngoài thiết kế gốc
- **View thường, không materialized** cho các view mới. Dữ liệu vài nghìn dòng mỗi người nên truy vấn trực tiếp vẫn rẻ và số luôn mới, không phụ thuộc `pg_cron`. Nếu chậm khi có nhiều người thì chuyển sang materialized và thêm vào `analytics_private.refresh_all`.
- **"Ôn đúng hạn" được xấp xỉ** bằng tỉ lệ từ đang đến hạn mà quá hạn hơn 2 ngày (`overdueShare`), vì không có lịch sử hạn ôn để tính đúng nghĩa "đến hạn rồi có ôn trong 2 ngày không". Chỉ hiển thị cho vui, không dùng để chọn gợi ý.
- **Chia đôi tính toán**: hồ sơ (nặng, lưu lại) và gợi ý (nhẹ, tính lúc đọc). Nhờ vậy trang chủ chỉ tốn thêm một truy vấn `user_insights` và không bao giờ phải đọc `answer_events`.
- **Weak-first chỉ áp cho vòng chơi** (`startRound`), không áp cho bài thi và bài kiểm tra: đề thi phải giữ cấu trúc cố định. Không đổi thứ tự ưu tiên giữa các nguồn (đến hạn trước, rồi từ mới); chỉ sắp lại trong từng nguồn.
- **Lĩnh vực `general` không được tính là nhóm yếu**: gần như mọi từ thuộc nhóm đó nên nó không cho biết gì.
- **Vắng ≥ 5 ngày**: chỉ gợi ý một vòng Trắc nghiệm nhẹ, bỏ mọi gợi ý nặng (từ tồn đọng, thi) để người học không bị dội lại.
- **Kỹ năng đọc hiểu yếu** dẫn tới trang Kiểm tra (chưa có trò riêng), giống quy ước ở 1b. Nghe dẫn tới trò `listen` (nghe từ), vì bài nghe dài chỉ có trong bài kiểm tra.
- **Đọc tối đa 5.000 câu gần nhất** mỗi lần tính hồ sơ (5 trang song song, vì Supabase giới hạn 1.000 dòng mỗi yêu cầu). Với người chơi rất nhiều (> ~80 câu/ngày) phần cũ nhất bị cắt; trọng số bán rã 14 ngày nên ít ảnh hưởng.
- **Vòng ngắn** ở `streak_risk` và `long_absence` chưa chỉnh được số câu: URL chơi chưa nhận `n`. Gợi ý dùng một vòng Trắc nghiệm bình thường.
- **Lỗi ở dữ liệu phụ không làm hỏng việc chính**: `logActivity` và `refreshInsightsSafe` nuốt lỗi (có log); đọc hồ sơ lỗi thì weak-first tắt và trang chủ vẫn có gợi ý theo tín hiệu tươi.

## Chưa làm / chưa kiểm tra
- **Chưa chạy trên Supabase thật.** Đã kiểm: logic thuần (47 test), migration + view + quyền trên Postgres thật (PGlite, gồm việc `metabase_ro` không đọc được muối và 11 câu hỏi SQL mới chạy được), service với repo giả, repo và weak-first với supabase-js thật nhưng `fetch` giả. **Chưa có test tích hợp `*.itest.ts` cho bước này**; cần `npx supabase start` rồi tự kiểm tay luồng: chơi vài vòng → mở `/insights` → xem `user_insights` và `activity_events`.
- **Script dashboard chưa chạy trên Metabase thật** (như bước 0); SQL từng câu hỏi đã chạy thử.
- Giao diện (`/insights`, khối gợi ý trang chủ) **chưa được dựng thử trong trình duyệt**, chưa xem khổ điện thoại và chế độ tối; mới qua typecheck và lint.
- **Các hệ số là giá trị khởi đầu** (ngưỡng yếu 0,7, ≥ 5 câu, bán rã 14 ngày, ngưỡng tồn đọng 15 từ, hạn mức weak-first 60%...), nằm ở `INSIGHT_CFG`. Chỉnh sau khi có dữ liệu thật; với 10–15 người, nhiều nhóm sẽ chưa đủ mẫu nên hồ sơ ban đầu khá thưa.
- **Chưa đo ảnh hưởng của weak-first lên kết quả học.** Đây là việc của giai đoạn đánh giá, không phải của bước này.
- Mỗi lần nộp bài tốn thêm khoảng 8 truy vấn nhỏ để làm mới hồ sơ; mỗi sự kiện hoạt động thêm một RPC. Chưa đo độ trễ thật.
