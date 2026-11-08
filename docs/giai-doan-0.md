# Giai đoạn 0 — Nền tảng: những gì đã làm

- **Token ngữ nghĩa + theme một trục**: `src/cosmetics/core/*`, theme `paper` và `dark`; `globals.css` và `app.css` gộp thành một tệp dùng token; `lib/theme.ts` viết lại (cookie + `auto`).
- **Registry + scaffold + CI**: `scripts/cosmetics/*`, `npm run new:theme|new:avatar|new:frame`, `.github/workflows/ci.yml`, `tests/cosmetics/*`.
- **Gallery**: `/admin/gallery`.
- **Vai trò admin**: `supabase/migrations/0017_profile_role.sql`, `requireAdmin()` / `requireAdminId()`, `getRole()`.
- **Font tự host**: Be Vietnam Pro qua `@fontsource` (OFL), hợp CSP `font-src 'self'`.
- **Khung Avatar mới**: `components/Avatar.tsx` có prop `frame`, vùng chứa cố định (không CLS).
- **Khung điều hướng** (Phần 3): tab Học / Nhiệm vụ / Xếp hạng / Tôi; `/insights` thuộc tab Học; thanh trên còn chat thú cưng + menu nhanh; biểu tượng SVG ở thanh điều hướng và thanh trên.
- **Test giao diện**: `playwright.config.ts`, `e2e/*` (đã viết, CHƯA chạy được trong môi trường làm việc này).

## Chủ ý để lại cho giai đoạn sau

- Emoji-avatar cũ và `AvatarPicker` vẫn chạy (chuyển tiếp). Migration đặt `profiles.avatar = null` nên làm ở giai đoạn 2, khi đã có ảnh của họa sĩ; làm sớm hơn thì người dùng không còn gì để chọn.
- `profiles.theme`, `profiles.frame`, bảng `cosmetics` / `user_cosmetics`, `cosmetics:sync`: giai đoạn 2.
- Registry Scene đăng nhập và `npm run new:scene`: giai đoạn 1 (cần engine).
- Chưa quét hết emoji trong từng trang và trò chơi; sẽ đổi theo từng trang khi xây lại.

## Cần bạn biết

- Bốn màu của `paper` được tối đi chút để đạt 4.5:1 (bản cũ 3.8–4.3): danger/lề `#d9453b → #c8382e`, success `#1b8458 → #177a52`, chữ mờ `#8a93ad → #6b7490`.
- `.mute` (nút trên thanh trên) tăng từ 38 lên 44px.
- Trang đăng nhập đã đổi sang kiểu tờ vở (khung cố định); thiết kế đầy đủ + Scene là giai đoạn 1.
- Đặt admin sau khi chạy migration 0017: `update public.profiles set role = 'admin' where id = '<uuid>';`
