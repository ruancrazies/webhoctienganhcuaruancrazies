# Bước 3: lớp AI (snapshot, pet chat có ngữ cảnh, coach, giải thích lỗi)

Giai đoạn 3 của `Thiết kế tích hợp phân tích dữ liệu và AI cá nhân hoá`. Dựa trên hồ sơ năng lực và gợi ý theo luật của bước 2. **Có migration mới: `0015_ai_cache.sql`.** Nguyên tắc giữ nguyên từ bước 2: **luật chọn hành động, AI chỉ diễn đạt**; mọi con số AI nhắc phải có trong dữ liệu người học cũng thấy ở `/insights` và `/results`.

> Lưu ý đặt tên: `docs/buoc-3-dang-nhap.md` là bước 3 của đợt làm app gốc (đăng nhập), không phải tài liệu này.

## Đã làm gì
- **Learner snapshot** (`core/snapshot.ts`, hàm thuần): bản tóm tắt gọn (≤ 2.200 ký tự, cỡ 500 token) gồm cấp đang học và khoảng cách tới kỳ thi, độ chính xác và xu hướng, điểm theo kỹ năng, 3 điểm yếu kèm số mẫu, điểm bài kiểm tra, thói quen, tình trạng hôm nay (từ đến hạn, chuỗi, ngày vắng) và các hành động đã chọn bằng luật kèm mã lý do. **Ẩn danh theo cấu trúc**: hàm dựng nhận hồ sơ + tín hiệu tươi + hành động, không nhận tên/email/id nên không thể rò chúng; có test cho việc đó. Dựng từ hồ sơ **đã lưu** (không đọc `answer_events`), bốn truy vấn nhỏ (`services/learner.ts`); lỗi → `null`, không ném.
- **Pet chat có ngữ cảnh**: `buildSystemPrompt(pet, knowledge, learnerContext?)` thêm khối `LEARNER_CONTEXT` ở cuối; tính cách Nuonuo/Phoebe giữ nguyên. Khối này nói rõ: chỉ nhắc khi liên quan, chỉ dùng số có trong khối, không bịa tên, chỉ gợi ý trong danh sách luật đã chọn. Không có ngữ cảnh (người học tắt, hoặc dựng lỗi) thì prompt và hành vi y như trước.
- **Coach hằng ngày** (`GET /api/insights/coach?ai=0|1`, `services/coach.ts`): kế hoạch 3 hành động vẫn do luật chọn; Gemini chỉ viết lời nhắn 1–3 câu. Hiện ở đầu khối "Hôm nay nên học gì" ở trang chủ (`CoachNote`, tải sau khi trang đã hiện).
  - Cache theo (người, ngày giờ VN) ở `coach_messages`, kèm **dấu vân tay bộ gợi ý** (mã lý do + chủ đề + kỹ năng): gợi ý đổi trong ngày thì viết lại, không hiện lời nhắn lệch với danh sách bên dưới.
  - **Kiểm tra số liệu** (`checkCoachText`): lời nhắn chứa số không có trong snapshot, có đường dẫn/email, quá dài hoặc quá ngắn thì bị loại và dùng câu theo luật (`fallbackCoach`). Câu dự phòng không được cache nên lần sau thử lại.
  - Hạn mức: tối đa 6 lần GỌI Gemini mỗi người mỗi ngày (`COACH_PER_DAY`); lời nhắn đã cache không tính. Hết hạn mức, không có khoá Gemini, Gemini lỗi, hay người học tắt cá nhân hoá → câu theo luật (`source: "rule"`), API vẫn trả 200.
- **Giải thích lỗi** (`POST /api/results/explain`, `services/explain.ts`): nút "Giải thích vì sao sai" ở trang xem lại bài (`/results/[type]/[id]`) cho câu sai. Câu lấy qua `getReviewedItem` nên cùng quy tắc quyền với xem lại (bài người khác = 404).
  - Cache **dùng chung** theo (câu, đáp án sai) ở `error_explanations`, khoá là sha256 của nội dung chuẩn hoá; bảng không có `user_id`. Cùng lỗi trên cùng câu chỉ tốn một lần gọi.
  - Giới hạn 20 lần/giờ và 60 lần/ngày mỗi người (chỉ tính lần phải gọi Gemini).
  - Câu đã có `explanation` trong đề (ngữ pháp) thì không hiện nút. Câu bài đọc/nghe (`passage`) chưa hỗ trợ (422).
- **Quyền riêng tư và tuỳ chọn**: có hộp chọn trong khung chat và nút "Tắt cá nhân hoá AI" ở lời nhắn coach (`lib/aiPrefs.ts`, lưu `localStorage`, **mặc định bật**). Tắt thì pet không nhận `LEARNER_CONTEXT` và coach không gọi Gemini. Cả hai chỗ đều ghi rõ dữ liệu gửi đi là bản tóm tắt ẩn danh, không có tên/email, sang Google Gemini.
- `askGemini` nhận thêm tuỳ chọn (`temperature`, `maxOutputTokens`); mặc định cho chat giữ nguyên 0,5 và 450.

## Migration 0015
- `coach_messages(user_id, day, message, source, fingerprint, created_at)`, khoá chính `(user_id, day)`, `on delete cascade` theo `profiles`.
- `error_explanations(cache_key, text, created_at)`, `cache_key` đúng 64 ký tự.
- Cả hai: bật RLS, thu hồi quyền `anon`/`authenticated`, chỉ `service_role`. Không nằm trong schema `analytics` (Metabase không thấy). Chạy lại an toàn (`if not exists`).

## File mới
- `src/core/snapshot.ts`, `src/core/explain.ts`
- `supabase/migrations/0015_ai_cache.sql`
- `src/server/repo/ai.ts`, `src/server/services/{learner,coach,explain}.ts`
- `src/app/api/insights/coach/route.ts`, `src/app/api/results/explain/route.ts`
- `src/components/{CoachNote,ExplainButton}.tsx`, `src/lib/aiPrefs.ts`
- `tests/core/{snapshot,explain}.test.ts`, `tests/server/{ai-services,gemini-opts}.test.ts`, `tests/db/ai-cache.test.ts`

## File sửa
- `src/core/chat.ts` (tham số `learnerContext` tuỳ chọn), `src/server/services/chat.ts` (dựng ngữ cảnh, tôn trọng `personalize`), `src/server/chat/gemini.ts` (tuỳ chọn)
- `src/server/services/results.ts` (`getReviewedItem`), `src/server/services/index.ts`, `src/server/repo/index.ts`, `src/server/limits.ts`, `src/server/hash.ts` (`sha256Hex`)
- `src/types/api.ts` (`personalize` trong `chatSchema`, `CoachResponse`, `explainSchema`, `ExplainResponse`)
- `src/components/{PetChat,AttemptView}.tsx`, `src/app/(app)/page.tsx`, `src/app/(app)/results/[type]/[id]/ResultReview.tsx`, `src/app/app.css`
- `tests/core/chat.test.ts`

## Triển khai
1. Chạy migration: `npx supabase db push` (hoặc dán `0015_ai_cache.sql` vào SQL Editor). Chạy lại an toàn.
2. Triển khai code. Không có biến môi trường mới: dùng `GEMINI_API_KEY` và `GEMINI_MODEL` đã có. Thiếu khoá thì mọi thứ rơi về câu theo luật.
3. **Trước khi triển khai, xử lý `src/server/chat/knowledge.ts`** (xem mục dưới).

## Quyết định ngoài thiết kế gốc
- **Giải thích lỗi làm luôn ở bước này.** Mục 8 của thiết kế ghi "giai đoạn sau", nhưng lộ trình (mục 12, giai đoạn 3) liệt kê nó. Bản này chỉ làm phần nhỏ: câu từ vựng và ngữ pháp trong bài đã nộp.
- **Coach nói giọng trung tính, không theo giọng Nuonuo/Phoebe**, vì lời nhắn cache theo ngày và theo người, không theo pet đang bật. Muốn đúng giọng pet thì thêm pet vào khoá cache (tăng số lần gọi).
- **Kiểm tra số liệu nghiêm ngặt**: số nhỏ phải viết bằng chữ ("một vòng"). Thỉnh thoảng một câu hợp lệ bị loại vì dùng chữ số; đổi lại AI không thể đưa số lạ vào lời nhắn. Nới bằng cách cho phép riêng các số 1–3 nếu thấy loại quá nhiều.
- **Chat tự do không bị kiểm tra số** (không thể bắt hết câu trả lời tự do); chỉ ràng buộc bằng chỉ dẫn trong prompt. Chỉ coach được kiểm tra bằng mã.
- **Không ghi `activity_events` cho coach và giải thích lỗi.** Mở trang chủ không phải học, và mỗi sự kiện sẽ kéo dài phiên học trong dashboard giữ chân.
- **Tuỳ chọn cá nhân hoá lưu ở trình duyệt** (không đồng bộ giữa các máy) và **mặc định bật**. Muốn mặc định tắt hoặc lưu theo tài khoản thì cần thêm cột ở `profiles`.
- **Chống chèn chỉ dẫn**: đáp án người học gõ được cắt 100 ký tự, gộp một dòng, đưa vào như một giá trị JSON; system prompt coi dữ liệu là dữ liệu. Đáp án sai dài hơn 60 ký tự không ghi cache dùng chung.
- **Snapshot dùng hồ sơ đã lưu**, nên có thể cũ tới lần nộp bài gần nhất (số từ đến hạn, chuỗi, cấp thì tươi). Không tính lại ở mỗi tin nhắn.

## Chưa làm / chưa kiểm tra
- **Chưa gọi Gemini thật.** Mọi test dùng Gemini giả. Chưa biết chất lượng lời nhắn và lời giải thích thật, và chưa kiểm được `maxOutputTokens` 300/400 có đủ với model đang dùng (một số model tính cả token suy nghĩ vào trần này; nếu thấy câu bị cụt thì tăng).
- **Chưa chạy trên Supabase thật**; chưa có test tích hợp `*.itest.ts` cho bước này. Đã kiểm: logic thuần, migration + ràng buộc + quyền trên Postgres thật (PGlite), service với repo và Gemini giả, `askGemini` với `fetch` giả. Cần `npx supabase start` rồi tự kiểm tay: chơi vài vòng, mở trang chủ (lời nhắn coach), mở một bài đã nộp và bấm "Giải thích vì sao sai", mở khung chat và hỏi "mình nên học gì".
- **Giao diện chưa dựng thử trong trình duyệt** (khối coach, nút giải thích, hộp chọn trong khung chat, chế độ tối, khổ điện thoại); mới qua typecheck và lint.
- **Mỗi tin chat tốn thêm ~4 truy vấn nhỏ** (hồ sơ, từ đến hạn, trạng thái cấp, profile) khi bật cá nhân hoá. Chưa đo độ trễ.
- Câu bài đọc/nghe chưa có giải thích tự động. Nội dung chat vẫn không được lưu.
- Chưa có trang xuất/xoá dữ liệu cá nhân (nêu ở mục 9 của thiết kế), và chưa có thông báo quyền riêng tư đầy đủ ngoài hai dòng ghi chú trong giao diện.
- Giai đoạn 4 (đo hiệu quả) chưa làm.
