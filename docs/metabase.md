# Metabase cho quản trị (giai đoạn 1a)

Metabase chỉ phục vụ **người quản trị**, chỉ đọc schema `analytics` bằng role `metabase_ro`. Người học xem dữ liệu của mình trong app (giai đoạn 1b và 2), không qua Metabase.

```
App Next.js ──ghi──▶ Postgres (Supabase): public.answer_events …
                              │  (view / materialized view, làm mới mỗi đêm)
                              ▼
                       schema analytics ◀──SELECT──  Metabase (Docker) ◀── người quản trị
                                                    └─ metadata riêng: container metabase-db
```

## 1. Áp migration 0013

```bash
npx supabase db push          # Supabase thật; local: npx supabase db reset
```

Migration tạo schema `analytics` (view), `analytics_private` (hàm làm mới, nhật ký), role `metabase_ro`, và lịch `pg_cron` (nếu extension có sẵn). Như mọi migration, `db push` chỉ chạy nó một lần mỗi môi trường.

Các view chỉ có dữ liệu từ lúc triển khai bước 0 (`answer_events` không backfill được). Ngay sau khi chơi thử vài vòng, làm mới tay để thấy số liệu liền:

```sql
select analytics_private.refresh_all();   -- chạy bằng role postgres / service_role (SQL editor của Supabase)
```

## 2. Đặt mật khẩu cho `metabase_ro`

Migration tạo role **không có mật khẩu** (chưa đăng nhập được) để không có mật khẩu nào nằm trong repo. Đặt mật khẩu dài, ngẫu nhiên, lưu ở nơi giữ bí mật của bạn:

```sql
alter role metabase_ro with password '<chuỗi dài ngẫu nhiên>';
```

Supabase SQL editor lưu lịch sử truy vấn; nếu ngại để mật khẩu trong đó, dùng `psql` với chuỗi kết nối của role `postgres`, hoặc đặt lại mật khẩu role ở Database → Roles.

## 3. Lịch làm mới ban đêm (pg_cron)

Migration tự đặt lịch `analytics-refresh` lúc 20:00 UTC (03:00 giờ Việt Nam) nếu `pg_cron` có sẵn. Kiểm tra:

```sql
select jobname, schedule, active from cron.job where jobname = 'analytics-refresh';
```

Không có dòng nào: bật extension ở Supabase Dashboard → Database → Extensions → `pg_cron`, rồi chạy:

```sql
select cron.schedule('analytics-refresh', '0 20 * * *', 'select analytics_private.refresh_all()');
```

Dashboard "Sức khoẻ dữ liệu" có thẻ **Lần làm mới gần nhất**: `hours_since_refresh` quá khoảng 26 giờ nghĩa là lịch không chạy.

## 4. Chạy Metabase cục bộ

```bash
cp docs/metabase.env.example .env.metabase      # sửa MB_DB_PASS
docker compose -f docker-compose.metabase.yml --env-file .env.metabase up -d
```

Mở http://localhost:3000, chạy trình hướng dẫn cài đặt: tạo tài khoản quản trị (mật khẩu mạnh), bỏ qua bước "thêm dữ liệu" (làm ở mục 5). Lần khởi động đầu mất vài phút.

Sau lần chạy đầu, ghim phiên bản: xem số phiên bản ở Admin → Settings → Updates (hoặc `docker compose ... logs metabase | head`), đặt `METABASE_VERSION=v0.xx.y` trong `.env.metabase`. `latest` chỉ tiện cho lần đầu.

Bộ nhớ: compose đặt `-Xmx1g` làm mức khởi đầu. Mình chưa đối chiếu con số này với tài liệu của Metabase; nếu chuyển lên máy chủ nhỏ, kiểm tra yêu cầu RAM trong tài liệu rồi chọn máy.

## 5. Kết nối CSDL của app

Admin → Databases → Add database → PostgreSQL. **Tên phải là `English Game analytics`** (script ở mục 6 tìm theo tên này; hoặc đặt `MB_DATABASE_NAME`).

| Nơi chạy | Host | Port | Database | User |
| --- | --- | --- | --- | --- |
| Supabase local (`supabase start`) | `host.docker.internal` | 54322 | `postgres` | `metabase_ro` |
| Supabase thật, **session pooler** (khuyên dùng) | host của Session pooler ở Project → Connect | 5432 | `postgres` | `metabase_ro.<project-ref>` |
| Supabase thật, kết nối trực tiếp | `db.<project-ref>.supabase.co` | 5432 | `postgres` | `metabase_ro` |

- **Không dùng transaction pooler** (cổng 6543): Metabase dùng prepared statement.
- Kết nối trực tiếp của Supabase mặc định chỉ có IPv6; nếu máy chạy Metabase không có IPv6, dùng session pooler. Cú pháp user qua pooler và host chính xác lấy từ Dashboard của dự án, mình chưa thử với dự án thật của bạn.
- Bật SSL với Supabase thật. Trong "Show advanced options": **Choose when syncing → Only these schemas → `analytics`**.
- `metabase_ro` có tối đa 5 kết nối cùng lúc, nên không chiếm hết kết nối của app.

Bật cache ngắn cho các câu hỏi nặng nếu dữ liệu lớn (Admin → Performance); các view đã tính sẵn nên thường không cần.

## 6. Dựng dashboard

Cách nhanh, từ các file SQL trong `scripts/metabase/questions/`:

```bash
MB_URL=http://localhost:3000 MB_USER=<email quản trị> MB_PASSWORD=<mật khẩu> npx tsx scripts/metabase/setup.ts
```

Tạo collection **English Game: phân tích** với năm dashboard: **Từ và bài khó** (8 câu hỏi), **Sức khoẻ dữ liệu** (3 câu hỏi), **Hoạt động và giữ chân** (6 câu hỏi), **Trình độ chung** (5 câu hỏi; hai dashboard này từ giai đoạn 2, xem `docs/buoc-2-ho-so-va-goi-y.md`) và **Hiệu quả gợi ý** (6 câu hỏi, giai đoạn 4, xem `docs/buoc-4-do-hieu-qua.md`). **Cần migration 0016** thì các view có `user_ref` mới đọc được bằng `metabase_ro`. Chạy lại thì cập nhật theo tên, không nhân đôi.

**Script này chưa được chạy thử trên Metabase thật** (môi trường soạn không có Metabase). Luồng chạy đã thử với máy chủ giả, SQL của từng câu hỏi đã chạy thử trên Postgres, nhưng cách Metabase nhận cấu hình dashboard thì chưa. Nếu script báo lỗi, nó in nguyên phản hồi của Metabase; khi đó làm thủ công như dưới đây.

**Thủ công**: New → SQL query, chọn kết nối `English Game analytics`, dán nội dung file `.sql` (bỏ các dòng `-- name:`, `-- dashboard:`…). Biến `{{...}}` tự thành ô lọc; `[[ ... ]]` là điều kiện tuỳ chọn. Lưu câu hỏi, thêm vào dashboard, nối bộ lọc dashboard với biến cùng tên.

### Bộ lọc dashboard "Từ và bài khó"

| Bộ lọc | Mặc định | Dùng cho |
| --- | --- | --- |
| Lượt tối thiểu | 20 | mọi bảng xếp hạng |
| Số người tối thiểu | 5 | mọi bảng xếp hạng |
| Cấp, Lĩnh vực, Loại từ | trống | từ vựng, nhóm |
| Game | trống | từ theo game, ngữ pháp, nhóm, cặp dễ nhầm, cờ nghi vấn |
| Chủ đề ngữ pháp | trống | ngữ pháp, nhóm |

### Đọc kết quả

- **Xếp hạng theo `wrong_rate_smoothed`**, không theo `wrong_rate`. Công thức `(sai + 5·p0) / (lượt + 5)`: p0 là tỉ lệ sai trung bình của nhóm (cấp cho từ; loại câu × game × cấp cho `item_stats`). Một từ sai 1/1 lượt không đứng đầu bảng.
- **Cờ nghi vấn nội dung**: `high_wrong_rate` (≥ 10 người, sai ≥ 80%), `strong_users_wrong` (≥ 5 người học mạnh, nhóm đó sai ≥ 50%), `both`. "Người học mạnh" = từ 30 câu trở lên và đúng ≥ 80% tổng thể. Dùng `sheet_tab` + `content_key` để tìm đúng dòng trên Google Sheet (từ vựng: tab theo cấp; ngữ pháp: tab `grammar`; bài đọc/nghe: `passage_questions` hoặc `reading_questions`). Ngưỡng là giá trị khởi đầu, nằm trong `0013_analytics_schema.sql`; sửa bằng migration mới sau khi có dữ liệu thật.
- Với 10–15 người học, nhiều từ sẽ không bao giờ đủ 20 lượt và 5 người. Dùng **Nhóm khó** để xem theo loại từ / lĩnh vực / chủ đề khi từng từ chưa đủ mẫu.
- `flash` và `match` server không chấm: ở sự kiện, "đúng" nghĩa là nhớ/ghép ngay lần đầu.
- Câu hỏi bài đọc/nghe của đề tạo **trước** bước 0 không có `passage_question_id` nên không vào `item_stats`.

## 7. Kiểm tra giai đoạn 1a hoàn thành

1. `select analytics_private.refresh_all();` rồi mở **Từ và bài khó**: có top khó, cặp dễ nhầm; cờ nghi vấn có thể trống nếu chưa đủ mẫu (bình thường).
2. Kiểm tra quyền, kết nối bằng chính `metabase_ro` (ví dụ `psql` với chuỗi kết nối của role này):

   ```sql
   select count(*) from analytics.word_stats;   -- được
   select count(*) from public.words;           -- phải lỗi: permission denied
   select * from public.answer_events limit 1;  -- phải lỗi: permission denied
   select * from public.game_rounds limit 1;    -- phải lỗi (đây là bảng chứa đáp án)
   create table analytics.x (a int);            -- phải lỗi
   ```
3. Test tự động (không cần Supabase): `npm test` → `tests/db/analytics-views.test.ts` kiểm tra số liệu của view, từng câu hỏi SQL, và `metabase_ro` không đọc được bất kỳ bảng nào ở `public`, `auth`, `analytics_private`.

## 8. Vận hành và bảo mật

- Admin → Settings → **tắt Public sharing** và Embedding. Người không phải quản trị chỉ cấp quyền xem.
- Chỉ mở Metabase ra ngoài sau HTTPS (reverse proxy). Compose chỉ gắn cổng vào `127.0.0.1`.
- Schema `analytics` **không được thêm vào Exposed schemas** của Supabase API (Project Settings → API). Mặc định chỉ `public` được mở.
- `analytics` không có `user_id`, username hay email. Từ migration 0014, bốn view theo người (`activity_daily`, `user_cohorts`, `user_levels`, `exam_scores`) có cột `user_ref`: băm một chiều có muối của `user_id`, đủ để đếm người và theo dõi giữ chân, không hiện danh tính. Muối nằm ở `analytics_private.user_salt`, `metabase_ro` không đọc được (từ migration 0016, `metabase_ro` có quyền chạy `user_ref()` vì các view cần gọi nó, nhưng không đọc được bảng muối). Với 10–15 người, quản trị viên vẫn có thể đoán ra ai từ hành vi; xem số liệu từng người vẫn là quyết định riêng và cần thông báo cho người dùng.
- **Sao lưu metadata**: `docker compose -f docker-compose.metabase.yml --env-file .env.metabase exec -T metabase-db pg_dump -U metabase metabase > metabase-backup.sql`. Mất dữ liệu này là mất dashboard (dựng lại bằng script mục 6), không mất dữ liệu học tập.
- **Cập nhật phiên bản**: sao lưu metadata, đổi `METABASE_VERSION`, `docker compose ... up -d`.
- **View là hợp đồng với Metabase**: thêm cột thì an toàn; đổi tên hoặc xoá cột làm hỏng câu hỏi đã lưu. Muốn đổi cấu trúc, tạo view phiên bản mới (`word_stats_v2`) ở migration riêng.
- Xoá tài khoản người học xoá `answer_events` (`on delete cascade`); các materialized view chỉ phản ánh sau lần làm mới kế tiếp.
- Lên máy chủ nhỏ hoặc Metabase Cloud khi cần chia sẻ: dùng lại file compose này; phí và yêu cầu RAM chưa kiểm tra.
