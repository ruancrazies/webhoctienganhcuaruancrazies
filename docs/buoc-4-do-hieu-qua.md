# Bước 4: đo hiệu quả gợi ý và AI (so sánh trước/sau theo từng người)

Giai đoạn 4 của `Thiết kế tích hợp phân tích dữ liệu và AI cá nhân hoá`. **Không đổi code app**: chỉ thêm migration `0016_effect_analytics.sql`, câu hỏi và dashboard Metabase, test và tài liệu. Như thiết kế đã ghi, ~15 người/ngày thì A/B không đủ ý nghĩa thống kê, nên so sánh **trước/sau trên từng người**.

## Sửa lỗi của bước 2 (đọc phần này trước)
Từ migration 0014, `select * from analytics.activity_daily` (và `user_cohorts`, `user_levels`, `exam_scores`) **báo `permission denied for function user_ref` khi chạy bằng `metabase_ro`**. Bảng trong view được đọc bằng quyền chủ view, nhưng *hàm* gọi trong view thì kiểm quyền theo người truy vấn; 0014 lại thu hồi quyền chạy `user_ref()` của `metabase_ro`. Test cũ chỉ chạy `count(*)` (hàm bị lược khỏi kế hoạch truy vấn) nên không bắt được. Nghĩa là hai dashboard "Hoạt động và giữ chân" và "Trình độ chung" gần như chắc chắn **đang lỗi trên Metabase thật**.

0016 cấp lại đúng mức cần: `USAGE` trên `analytics_private` + `EXECUTE` trên `user_ref()` (và `sign_test_p()` của bước này). Bảng muối vẫn không đọc được vì hàm là `SECURITY DEFINER`; `metabase_ro` chỉ băm được `user_id` mà nó đã biết, và nó không đọc được `user_id` nào. Đã thêm test hồi quy: `metabase_ro` chạy `select *` trên **mọi** view trong `analytics`. Sửa một khẳng định ở `tests/db/analytics-activity.test.ts` (trước đó yêu cầu "không gọi được hàm băm").

## Đo cái gì
Hai can thiệp, mỗi can thiệp một mốc thời gian:

| Can thiệp | Là gì | Mốc bắt đầu (tự suy ra) |
| --- | --- | --- |
| `rules` | Giai đoạn 2: gợi ý theo luật + weak-first | Sự kiện hoạt động đầu tiên trong `activity_events` (trước giai đoạn 2 chưa ai ghi vào bảng này) |
| `ai` | Giai đoạn 3: coach AI | Lời nhắn coach do AI viết đầu tiên trong `coach_messages` |

Muốn đặt mốc tay (ví dụ biết đúng ngày triển khai): `insert into analytics_private.interventions (intervention, started_at) values ('rules', '2026-10-27 09:00+07') on conflict (intervention) do update set started_at = excluded.started_at;` Bảng này ghi đè giá trị suy ra.

**Cửa sổ so sánh**: hai cửa sổ dài bằng nhau, tối đa 14 ngày giờ Việt Nam, chỉ tính ngày đã trọn vẹn (hôm nay không tính), bỏ ngày bắt đầu. Ví dụ mốc cách đây 10 ngày thì "trước" là ngày −19…−11, "sau" là −9…−1. Dưới 7 ngày (`ready = false`) chỉ để xem trước.

**Người được xét**: người có câu trả lời ở cửa sổ "trước" (có nền để so). Người bỏ hẳn sau mốc **vẫn được tính** (số ngày học sau = 0); bỏ họ đi sẽ chỉ còn người ở lại và kết quả đẹp giả.

Chỉ số theo từng người (trong `analytics.effect_by_user`):
- **Độ chính xác** trước/sau, chỉ khi ≥ 10 câu ở phía đó.
- **Số ngày học** (ngày có ≥ 1 câu trả lời) và **số câu**: thước đo giữ chân. Cố ý không dùng `activity_events` để đếm ngày học vì trước giai đoạn 2 nó không tồn tại: so sánh sẽ lệch.
- **Tỉ lệ vòng bỏ dở**, chỉ khi ≥ 3 vòng mở ở phía đó; thấp hơn là tốt hơn.
- **Điểm bài kiểm tra thường xuyên** (trung bình trong cửa sổ), chỉ người có bài ở cả hai phía.

`analytics.effect_summary` tổng hợp theo (can thiệp, nhóm, chỉ số): số người **cải thiện / không đổi / xấu đi** (theo hướng tốt hơn của từng chỉ số), trung vị và trung bình thay đổi, và **p của kiểm định dấu hai phía** (đúng, tính từ phân phối nhị thức; người không đổi bị loại khỏi phép thử).

Với `ai`, người được chia hai nhóm: **exposed** (nhận ≥ 3 lời nhắn AI trong cửa sổ sau) và **not_exposed** (còn lại, gồm người tắt cá nhân hoá). `rules` áp dụng cho mọi người nên chỉ có nhóm exposed.

## Dashboard "Hiệu quả gợi ý" (6 câu hỏi, `scripts/metabase/questions/23…28`)
Mốc bắt đầu và cửa sổ; tổng hợp theo chỉ số; độ chính xác, số ngày học và điểm kiểm tra theo từng người; lời nhắn coach AI mỗi ngày. Dựng bằng `scripts/metabase/setup.ts` như các dashboard trước (chạy lại thì cập nhật, không nhân đôi).

## Triển khai
1. `npx supabase db push` (hoặc dán `0016_effect_analytics.sql` vào SQL Editor). Chạy lại an toàn (bảng `if not exists`, view mới, `create or replace` cho hàm). Migration này cũng **sửa lỗi quyền** ở trên nên nên chạy dù chưa cần dashboard mới.
2. Chạy lại `scripts/metabase/setup.ts` để dựng dashboard mới và cập nhật các câu hỏi cũ.
3. Sau khi chạy, mở dashboard "Hoạt động và giữ chân" và "Trình độ chung": nếu trước đó chúng lỗi thì giờ phải hiện số liệu.

## Cách đọc, và vì sao KHÔNG đọc thành "gợi ý làm điểm tăng X%"
- **Không có nhóm đối chứng ngẫu nhiên.** Mọi người đều nhận `rules` cùng lúc, nên chênh lệch trước/sau lẫn cả xu hướng chung (học lâu thì giỏi lên), hiệu ứng mới lạ, kỳ thi, nghỉ lễ, và việc mới học thì độ chính xác mới ban đầu thường thấp.
- **Nhóm exposed/not_exposed của `ai` không phải đối chứng ngẫu nhiên.** Người nhận lời nhắn là người mở trang chủ thường xuyên, tức vốn đã chăm hơn. Chỉ dùng để xem nhóm không nhận có xu hướng khác không, không dùng để kết luận AI "gây ra" điều gì. (Người tắt cá nhân hoá bằng nút trong app cũng nằm ở not_exposed; app không ghi lại việc tắt vì lưu ở `localStorage`.)
- **Mẫu nhỏ.** 10–15 người thì `sign_test_p` gần như luôn lớn; 5 người cùng cải thiện, 0 người xấu đi cũng chỉ ra p = 0,0625. Đọc `improved / worsened` và số người (`users`) trước, p sau. Dòng nào `ready = false` hoặc `users` < 5 thì coi như chưa có gì để nói.
- **Hai can thiệp chồng nhau.** Cửa sổ "sau" của `rules` đã chứa `ai` từ mốc của `ai` trở đi. Tách tác dụng riêng của AI không làm được với dữ liệu này.
- Người mới sau mốc không có nền nên không được xét; kết quả chỉ nói về nhóm đã chơi từ trước.

## Quyết định ngoài thiết kế gốc
- **Mốc tự suy ra từ dữ liệu**, có bảng ghi đè tuỳ chọn, để không phải nhớ ngày triển khai và không thêm cột/bảng ghi "phiên bản app".
- **Chỉ số "ôn đúng hạn" của thiết kế KHÔNG làm.** Không có lịch sử hạn ôn (`user_word_progress` chỉ giữ `next_review` hiện tại), nên không tính lại được "từ đến hạn được ôn trong 2 ngày" cho quá khứ; bước 2 cũng đã nói đây chỉ là xấp xỉ. Thay bằng số ngày học, số câu và tỉ lệ bỏ dở. Muốn có chỉ số này thì phải bắt đầu chụp ảnh nhanh số từ đến hạn mỗi ngày (dữ liệu chỉ có từ lúc bắt đầu chụp).
- **Không đo "người học có làm theo gợi ý không"** (hành động coach gợi ý có được thực hiện): `coach_messages` chỉ lưu dấu vân tay bộ gợi ý, không lưu danh sách hành động, và bước 3 cố ý không ghi `activity_events` cho coach. Cần thêm cả hai thì phải đổi code app.
- **Không đo riêng "giải thích lỗi"**: `error_explanations` là cache dùng chung, cố ý không có `user_id`, nên không gán được cho từng người.
- **Chưa có chỉ số riêng cho weak-first** (độ chính xác trên đúng các nhóm từng yếu): hồ sơ điểm yếu chỉ lưu bản mới nhất, không có lịch sử để biết nhóm nào yếu tại thời điểm "trước".
- **View thường, không materialized**, cùng lý do như bước 2: dữ liệu nhỏ, số luôn mới.

## File mới
- `supabase/migrations/0016_effect_analytics.sql`
- `scripts/metabase/questions/23…28-hieu-qua-*.sql`
- `tests/db/analytics-effect.test.ts`
- `docs/buoc-4-do-hieu-qua.md`

## File sửa
- `scripts/metabase/setup.ts` (thêm dashboard `effect`), `docs/metabase.md`
- `tests/db/analytics-views.test.ts` (số file câu hỏi 22 → 28; `effect_by_user` được phép có `user_ref`)
- `tests/db/analytics-activity.test.ts` (một khẳng định về quyền, xem mục sửa lỗi)

## Chưa làm / chưa kiểm tra
- **Chưa chạy trên Supabase thật và Metabase thật**; script dựng dashboard vẫn chưa từng chạy trên Metabase thật (như các bước trước). Đã kiểm trên Postgres thật (PGlite): số liệu từng view với dữ liệu dựng tay (có người tiến bộ, sa sút, bỏ hẳn, không có nền, ngày bắt đầu và hôm nay bị loại), kiểm định dấu so với giá trị tính tay, quyền, 6 câu hỏi SQL chạy được.
- **Chưa có dữ liệu thật để đọc**: cần ít nhất 7 ngày sau mốc (`ready`) và đủ số người có nền. Trước đó dashboard chủ yếu trống hoặc `ready = false`.
- Chưa đo độ chậm của `effect_by_user` khi nhiều người (nó đọc `activity_daily`, vốn gộp từ ba bảng mỗi lần truy vấn). Nếu chậm thì chuyển sang materialized và thêm vào `analytics_private.refresh_all`.
- Các ngưỡng (14 ngày tối đa, ≥ 7 ngày để `ready`, ≥ 10 câu, ≥ 3 vòng, ≥ 3 lời nhắn để exposed) là giá trị khởi đầu, đổi bằng migration mới.
