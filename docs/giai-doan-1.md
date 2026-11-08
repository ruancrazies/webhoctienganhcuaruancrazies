# Giai đoạn 1 — Đăng nhập mới + Scene

## Đã làm
- **DB** `0018_login_scenes.sql`: `login_scenes`, `login_scene_schedules` (nhiều khoảng ngày, giờ VN), `admin_audit`, hàm `login_scene_set_pin` (ghim nguyên tử). RLS bật, chỉ `service_role`.
- **Chọn scene** `src/core/loginScene.ts` (hàm thuần): ghim → lịch (ưu tiên, rồi lịch bắt đầu muộn hơn) → mặc định. Nháp / scene đã xóa khỏi code bị bỏ qua. `getActiveScene()` cache **dữ liệu** theo tag `login-scenes`; admin lưu → `updateTag` nên hiệu lực ngay. DB lỗi → scene mặc định.
- **Engine** `src/features/login-scene/engine/` (loop, kéo thả, xoay, vùng sáng, dừng khi tab ẩn/đứng yên, DPR ≤ 2) + 3 scene: `default`, `halloween` (nhện, đèn pin, dơi), `giang-sinh` (tuần lộc, ngôi sao, tuyết).
- **Trang `/login`**: hai cột (≥ 800px) / dải 120px (điện thoại), dùng container query. Ô mật khẩu là `<input>` thật + nút **Hiện** (`aria-pressed`); chùm sáng chỉ là cách bật thêm cùng trạng thái đó. Tự ẩn khi rời vùng sáng / mất focus / gửi form.
- **Admin** `/admin/scenes` (danh sách + trạng thái), `/admin/scenes/<id>` (dùng ngay, câu chào, nháp/xuất bản, bật tắt canvas, lịch), `/admin/scenes/<id>/preview` (cả khổ 375px, form vô hiệu). Mọi action: `requireAdminId` → giới hạn tốc độ → zod → ghi `admin_audit` → xóa cache.
- `/admin/gallery` có thêm mục Scene với kết quả kiểm. `npm run new:scene <id> [-- --canvas]`; `gen:registry` sinh thêm registry scene + bộ nạp `draw.ts`.
- Trang auth còn lại dùng `AuthShell` (nền mặc định); `.auth-shell .card` đổi thành `.auth-card`.

## Khác với bản kế hoạch (có chủ ý)
1. Lịch nằm ở bảng riêng `login_scene_schedules` (một scene có nhiều khoảng, nhiều năm) thay vì cột `starts_at/ends_at` trong `login_scenes`.
2. Thêm hàm SQL ghim, vì chỉ mục duy nhất kiểm từng dòng nên không thể đổi ghim bằng một UPDATE đơn.
3. Tương phản kiểm bằng `checkScene` (cùng cổng cho CI và gallery), thêm ngân sách KB tính trên mã nguồn (cận trên an toàn, chưa phải số đo bundle thật).
4. `tests/cosmetics/no-raw-colors.test.ts` nới: cho `scene.ts`, `draw.ts`, `engine/geometry.ts` chứa màu; `scene.css` vẫn cấm màu thô.
5. Đã xóa `src/app/app.css` còn sót từ giai đoạn 0 (không ai import, làm 3 test cũ đỏ).

## Chạy thử
- Dev: `/login?scene=halloween` (chỉ ngoài production).
- Áp migration: `0018` rồi đặt admin bằng SQL: `update profiles set role='admin' where username='...'`.
- Test: `npm test` (792 test xanh), `npm run typecheck`, e2e mới ở `e2e/login-scene.e2e.ts` (ảnh chụp chuẩn cần tạo lần đầu bằng `--update-snapshots`; chưa chạy được ở đây vì cần Supabase thật).

## Chưa làm / cần bạn lưu ý
- E2E và axe chưa chạy với backend thật; mình đã kiểm tay bằng Playwright ở 375px và 1024px (không cuộn ngang, engine chạy, chùm sáng làm hiện mật khẩu).
- Chưa đo LCP/bundle thật (`next build` cần env đầy đủ). Chưa kiểm bằng screen reader thật.
- Scene Tết, Trung thu, Khai giảng thuộc giai đoạn 4.
