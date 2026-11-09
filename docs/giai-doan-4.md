# Giai đoạn 4 — Hoàn thiện

## Đã làm
- **Ba Scene mùa** `tet` (lân, bao lì xì, cánh mai đào rơi), `trung-thu` (thỏ ngọc, lồng đèn, sao và đom đóm), `khai-giang` (chú cặp sách, kính lúp, giấy màu). Mỗi scene có `scene.ts` + `scene.css` + `draw.ts`, tạo bằng `npm run new:scene <id> -- --canvas`, qua cổng `checkScene` (tương phản chữ 4.5:1, viền/focus 3:1, ngân sách KB). Đặt `active: true`; **lịch do admin tự đặt** ở `/admin/scenes/<id>` (Tết và Trung thu theo âm lịch, nên không ghi cứng ngày trong code).
- **Chọn màu nhấn** (xem `docs/cosmetics.md`): `0021_profile_accent.sql` (cột `profiles.accent`, chỉ nhận mã `^[a-z][a-z0-9-]{1,23}$`), `src/cosmetics/core/accents.ts`, `setAccentAction` (zod + giới hạn tốc độ, chặn mã lạ trước khi chạm DB), cookie `eg-accent`, bộ chọn `AccentPicker` trong **Cài đặt**. Áp tức thì trên thiết bị rồi server ghi vào tài khoản; lỗi thì trả về lựa chọn trước và báo bằng chữ. Đăng nhập ở thiết bị mới khôi phục cả màu nhấn (`restoreThemeCookie`).
- **Trợ năng**, sửa các lỗi thật tìm thấy khi quét mã:
  1. Viền focus của ô nhập (`.field input`, `.text-in`, ô chọn avatar) dùng `--mark` màu vàng, chỉ đạt **1,27–1,38:1** trên theme sáng (cần 3:1), và còn thắng luật focus chung vì độ ưu tiên CSS. Đã đổi sang `--accent` (≥ 6:1 ở mọi theme).
  2. Ô bấm dưới 44px: `.icon-btn` 36px, `.btn-sm` và `.pill` khoảng 39px, `.pw-toggle` 36px, `.nav a`, `.back`, `.pchat-x` 30px, `.pchat-pick button`. Đã nâng cả nhóm lên 44px.
  3. Khoảng 70 chỗ dùng **emoji làm biểu tượng** (🔊 🔥 🔒 ✓ ✗ ⏱ ⌫ ▲ ▼ …) thay bằng SVG; thêm 28 biểu tượng vào `Icon.tsx`; trò chơi dùng `icon` thay `emoji` trong `games/registry.ts`. Screen reader không còn đọc to tên emoji; biểu tượng đều `aria-hidden`, nhãn nằm ở chữ của nút. Mũi tên tăng/giảm điểm ở Hồ sơ năng lực giờ có chữ "tăng"/"giảm" (trước chỉ phân biệt bằng ▲/▼ và màu).
- **Kiểm tự động mới**: `tests/cosmetics/accents.test.ts` (6 màu × 5 theme), `a11y-css.test.ts` (focus 3:1, 44px, không emoji; đã thử đột biến: đặt lại viền vàng hay ô nhỏ thì test đỏ), `tests/db/profile-accent.test.ts`, `tests/server/accent-actions.test.ts`, `tests/core/accent-cookie.test.ts`. E2E mới: `e2e/a11y.e2e.ts` (Tab thấy viền focus, giảm chuyển động không còn hoạt ảnh nào đang chạy, 375/768/1024/1440px, nút ≥ 44px), `e2e/accent.e2e.ts`, và `e2e/login-scene.e2e.ts` mở rộng cho 6 scene × 4 khổ.

## Số đo (build trong môi trường phát triển, chưa phải đo trên Vercel)
- JS riêng của `/login`: khoảng **9,5 KB gzip** (cộng khoảng 129 KB bootstrap của Next dùng chung). `draw.ts` của scene chỉ nạp ở client sau khi form đã hiện.
- CSS của **cả 6 scene** chỉ khoảng **1,5 KB gzip**; mỗi mùa thêm khoảng 0,25 KB. Chưa cần tách theo scene.
- Phông Be Vietnam Pro: 15 tệp woff2 (5 độ đậm × 3 tập ký tự), mỗi độ đậm khoảng 33 KB cho tiếng Việt. Đây là phần nặng nhất của trang đăng nhập. Xem mục "Chưa làm".

## Khác với bản kế hoạch (có chủ ý)
1. Màu nhấn đè cả `controlBorder`, không chỉ bốn token nhấn, vì ở mọi theme viền ô nhập vốn trùng `accent`; nếu để nguyên, nút đổi màu còn ô nhập giữ màu cũ.
2. Màu nhấn chỉ cho tài khoản đã đăng nhập (ghi qua server); khách chưa đăng nhập dùng màu của theme.
3. Emoji còn lại có chủ ý: emoji **dữ liệu** (chủ đề và lĩnh vực nạp từ Sheet, avatar emoji cũ chuyển tiếp) và lời thoại thú cưng. Đều nằm trong danh sách bỏ qua của `a11y-css.test.ts`.
4. `.btn-sm` và `.pill` cao hơn trước (≥ 44px), nên các hàng nút nhỏ nhìn thoáng hơn một chút.

## Chạy thử
- Dev: `/login?scene=tet`, `/login?scene=trung-thu`, `/login?scene=khai-giang` (chỉ ngoài production).
- Áp migration: `0021` **trước khi deploy** (xem dưới).
- Test: `npm test` (1094 test), `npm run typecheck`, `npm run lint`, `npm run build`; e2e: `npm run test:e2e -- --update-snapshots` lần đầu để tạo ảnh chuẩn cho 3 scene mới.
- Đo thật: `npm run build; npm start`, rồi `npx lighthouse http://localhost:3000/login --only-categories=performance,accessibility --view` (cần Chrome/Edge); thêm `--preset=desktop` để đo khổ máy tính.

## Chưa làm / cần bạn lưu ý
- **Chưa chạy trình duyệt, axe, e2e và screen reader thật** trong lần làm này. Mình kiểm tương phản bằng tính toán, kiểm canvas bằng cách vẽ thử ra ảnh, kiểm mã bằng test. `scene.css` (hình tĩnh) của ba scene mới chưa được nhìn bằng mắt: xem ở `/admin/gallery` và `/login?scene=…` ở 375px và 1024px trước khi đặt lịch.
- **Cần xem lại bằng mắt** các nút đã cao lên 44px (hàng nút trong Nhiệm vụ, Cài đặt, thanh điều hướng desktop) và các biểu tượng SVG mới thay emoji (kích thước 14–40px do mình chọn theo ngữ cảnh).
- **LCP/CLS trang đăng nhập chưa đo thật.** Dự đoán: LCP là chữ nên không bị chặn bởi phông (`font-display: swap`), nhưng phông tải sau CSS và có thể gây xê dịch bố cục khi đổi phông. Hướng xử lý nếu số đo xấu: `next/font/local` hai lần (tập `latin` và `vietnamese`, ghép bằng `unicode-range` + biến CSS) để có preload và fallback khớp số đo; hoặc bớt độ đậm 500/800. Cả hai làm đổi diện mạo chữ nên cần xem bằng mắt, mình chưa làm.
- Màu nhấn đồng bộ giữa các thiết bị chỉ khi **đăng nhập** (không có vòng thăm dò như theme). Đổi ở máy B thì máy A đang mở giữ màu cũ tới lần đăng nhập sau.
- `getProfile` giờ đọc cột `accent`: nếu deploy code mà chưa áp `0021` thì **mọi trang cần hồ sơ sẽ lỗi**. Áp migration trước, deploy sau.
- Chưa kiểm bằng screen reader thật (NVDA/VoiceOver) và chưa duyệt thứ tự đọc của bộ chọn màu.
