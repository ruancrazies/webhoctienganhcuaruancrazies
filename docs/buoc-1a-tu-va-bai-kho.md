# Bước 1a: từ và bài khó trên Metabase

Giai đoạn 1a của `Thiết kế tích hợp phân tích dữ liệu và AI cá nhân hoá`. Dựa trên dữ liệu bước 0 (`answer_events`). **Không đổi code app**: chỉ thêm migration, tài liệu, file chạy Metabase và test.

## Đã làm gì
- Schema `analytics` chỉ chứa view, làm mới mỗi đêm bằng `pg_cron` (hoặc `select analytics_private.refresh_all()`).
- Role `metabase_ro`: chỉ `SELECT` trên `analytics`, mặc định chỉ đọc, giới hạn 60 giây/truy vấn, tối đa 5 kết nối.
- Hai dashboard dựng từ 11 câu hỏi SQL: **Từ và bài khó** (top từ khó, từ khó theo game, ngữ pháp khó, so sánh game cho cùng từ, cặp dễ nhầm, bài đọc/nghe khó, nhóm khó, cờ nghi vấn nội dung) và **Sức khoẻ dữ liệu** (số câu mỗi ngày, độ phủ `response_ms`, lần làm mới).

## File mới (giải nén đè lên thư mục dự án; không sửa file nào có sẵn)
- `supabase/migrations/0013_analytics_schema.sql`   schema, view, role, lịch pg_cron
- `docker-compose.metabase.yml`                      Metabase + Postgres metadata riêng
- `docs/metabase.md`                                 hướng dẫn dựng, kết nối, vận hành
- `docs/metabase.env.example`                        mẫu biến môi trường (sao thành `.env.metabase`)
- `scripts/metabase/questions/*.sql`                 11 câu hỏi (nguồn duy nhất, cả script và làm tay đều dùng)
- `scripts/metabase/setup.ts`                        dựng collection + câu hỏi + dashboard qua API Metabase
- `tests/db/analytics-views.test.ts`                 29 test (view, câu hỏi SQL, quyền `metabase_ro`)

## View
| View | Loại | Nội dung |
| --- | --- | --- |
| `analytics.word_stats` | materialized | theo từ, mọi game gộp |
| `analytics.item_stats` | materialized | theo (loại câu, id, game); có số liệu riêng cho người học mạnh |
| `analytics.group_stats` | materialized | theo (part, game, cấp, loại từ, lĩnh vực, chủ đề ngữ pháp) |
| `analytics.confusion_pairs` | materialized | tối đa 5 đáp án sai hay bị chọn nhất mỗi câu |
| `analytics.content_flags` | view thường | câu nghi sai nội dung (trên `item_stats`) |
| `analytics.events_daily` | view thường | số câu trả lời mỗi ngày (giờ VN), luôn mới |
| `analytics.refresh_status` | view thường | lần làm mới gần nhất |

## Triển khai
1. `npx supabase db push` (local: `db reset`). Triển khai code app không cần đổi gì.
2. Đặt mật khẩu `metabase_ro`, bật `pg_cron`, chạy Metabase, kết nối, dựng dashboard: làm theo `docs/metabase.md` mục 2–6.
3. `npm test` (không cần Supabase): 433 test qua, trong đó 29 test mới.

## Quyết định ngoài thiết kế gốc
- **Chưa có `user_ref` và muối băm.** Thiết kế nhắc `user_ref` cho dashboard theo người, nhưng không câu hỏi nào của 1a cần nó; thêm ở giai đoạn 2 để 1a không lộ gì thêm. Mọi view hiện chỉ có số đếm.
- **`events_daily` và `refresh_status`** (thiết kế gốc để dashboard "Sức khoẻ dữ liệu" dùng `activity_daily`, vốn thuộc giai đoạn 2). Hai view này giúp kiểm tra bước 0 đang thu đủ dữ liệu ngay bây giờ.
- **Người học mạnh** (cho cờ nghi vấn): từ 30 câu và đúng ≥ 80% tổng thể. Thiết kế chỉ nói "nhóm người học mạnh" mà không định nghĩa.
- **`sheet_tab`**: DB không lưu từ nằm ở tab nào; suy từ quy ước của `sheet.config.json` (từ vựng: tab theo cấp; ngữ pháp: `grammar`; bài đọc/nghe: `passage_questions` / `reading_questions`).
- Làm mới thường, không `CONCURRENTLY`: khoá vài giây lúc 03:00, không cần chỉ mục duy nhất. Đổi lại khi số liệu lớn.

## Chưa làm / chưa kiểm tra
- **Chưa chạy trên Metabase thật.** Môi trường soạn không tải được Metabase. SQL và quyền đã test trên Postgres (PGlite); `setup.ts` mới thử với máy chủ giả; `docker compose config` hợp lệ nhưng container chưa chạy.
- Chưa thử kết nối từ Metabase tới Supabase thật (IPv4/IPv6, cú pháp user qua pooler, giới hạn kết nối của gói đang dùng).
- Chưa kiểm tra RAM cần cho Metabase và phiên bản nên ghim (compose dùng `latest` cho lần chạy đầu).
- `pg_cron` bị bỏ qua khi chạy test (PGlite không có); lịch đêm chỉ được kiểm khi áp lên Supabase.
- Dashboard **Hoạt động và giữ chân**, **Trình độ chung** (giai đoạn 2) và API/trang `/results` (1b).
