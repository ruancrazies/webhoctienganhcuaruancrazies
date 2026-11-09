# Cosmetic: theme, avatar, khung (giai đoạn 0)

Lõi chỉ biết hợp đồng; thêm một món = thêm một thư mục + một lệnh, không sửa component, trang hay schema.

| Loại | Lệnh | Thư mục | Ảnh |
| --- | --- | --- | --- |
| Theme | `npm run new:theme <id>` | `src/cosmetics/themes/<id>/theme.ts` | — |
| Avatar | `npm run new:avatar <id>` | `src/cosmetics/avatars/<id>/avatar.ts` | `public/avatars/<id>/96.webp`, `192.webp` |
| Khung | `npm run new:frame <id>` | `src/cosmetics/frames/<id>/frame.ts` | `public/frames/<id>/96.webp`, `192.webp` |

Món mới sinh ra với `active: false` (chưa ai chọn được). Quy trình: sửa manifest → xem ở `/admin/gallery` (cần `profiles.role = 'admin'`) → `npm test` → đổi `active` (hoặc xóa dòng) → deploy.

## Quy ước

- `id` bất biến (DB và cookie tham chiếu); chữ thường, số, gạch ngang, 2–24 ký tự. Đổi tên chỉ đổi `name`.
- Ngừng cung cấp = `active: false`, không xóa thư mục.
- `registry.generated.ts` được sinh từ thư mục (`npm run gen:registry`, chạy trong `prebuild`). Test và CI báo lỗi nếu lệch (`npm run check:registry`).
- Component và CSS chỉ dùng token ngữ nghĩa (`var(--accent)`, `var(--surface)`…; danh sách ở `src/cosmetics/core/tokens.ts`). Test `no-raw-colors` chặn mã màu thô và tên biến cũ.

## Cổng kiểm tự động (`tests/cosmetics`)

- Theme: đủ token đúng dạng `#rrggbb`; chữ ≥ 4.5:1, viền/điều khiển/chữ lớn ≥ 3:1 (`core/contrast.ts`).
- Avatar/khung: có `96.webp` và `192.webp`, đúng WebP vuông đúng cỡ, mỗi ảnh ≤ 15 KB.

## Bàn giao họa sĩ

- Avatar: nhân vật trong vòng tròn, nền trong suốt, xuất 96px và 192px (ảnh gốc từ 512px).
- Khung: lớp riêng, vuông 96px/192px, phần giữa để trống chừa ~80% cho avatar. Khung được vẽ rộng hơn avatar 24% (tràn ~12% mỗi bên). Bậc hiếm hiện bằng nhãn chữ, không chỉ bằng màu.

## Theme một trục

`<html data-theme="paper|dark|…">`. Lưu bằng cookie `eg-theme` (mã theme hoặc `auto`) để server render đúng ngay lần đầu. Khóa localStorage cũ được đổi một lần: `dark` → `dark`, `light`/`system` → `paper`. Chọn theme chưa có CSS trong trang thì tự `router.refresh()`.

**Lưu ý giai đoạn 2:** hiện server chỉ kiểm cookie là mã theme có thật và đang bật. Khi có theme khóa theo level, server phải kiểm quyền sở hữu lúc render.

## Kiểm giao diện (Playwright + axe)

`npm run test:e2e` (cần Supabase và tài khoản thử, xem `playwright.config.ts`). Lần đầu chạy với `--update-snapshots` để tạo ảnh chuẩn.

## Sự kiện (giai đoạn 3)

Món có `unlock: { type: "event", event: "<mã đợt>" }` được cấp qua nhiệm vụ sự kiện (xem `docs/giai-doan-3.md`). `durationDays` quyết định hạn dùng tính từ ngày nhận. Khung/avatar mới phải có ảnh 96/192 trước khi `active: true` (CI chặn món bật mà thiếu ảnh: `tests/cosmetics/assets-gate.test.ts`).

## Màu nhấn (giai đoạn 4)

`src/cosmetics/core/accents.ts`: sáu màu (Xanh biển, Xanh lá, Cam đất, Tím, Hồng sen, Đỏ son), mỗi màu có bộ `light` cho theme nền sáng và bộ `dark` cho theme nền tối. Màu đè lên `accent`, `accentSoft`, `onAccent`, `accentEdge` và `controlBorder` (ở mọi theme viền ô nhập vốn trùng `accent`). Không có bảng màu tự do.

- Lưu: `profiles.accent` (mã, `null` = màu của theme) và cookie `eg-accent`; `<html data-accent="…">` cộng một thẻ `<style data-accent-css>` chỉ chứa CSS của đúng màu đang chọn.
- Cổng kiểm: `tests/cosmetics/accents.test.ts` chạy toàn bộ luật tương phản của theme trên **mọi cặp màu × theme**. Thêm một theme mới hay một màu mới đều tự được kiểm lại.
- Thêm màu: thêm một mục trong `ACCENTS` (đủ `light` và `dark`), chạy `npm test`. Không cần migration.

## Trợ năng (giai đoạn 4)

`tests/cosmetics/a11y-css.test.ts` giữ ba điều của checklist ở mức CSS: viền focus chỉ dùng màu đủ 3:1 trên mọi theme (cấm `--mark`, `--border`), ô bấm tối thiểu 44px, và không còn emoji làm biểu tượng trong JSX (dùng `<Icon name="…" />`). Thêm biểu tượng mới: thêm một mục vào `PATHS` trong `src/components/Icon.tsx`.


## Skin và họa tiết nền (giao diện bên trong)

Mỗi theme có thêm hai trường tùy chọn, tách khỏi bảng màu:

- `skin`: hình khối của thẻ, nút, thanh tiến độ. `paper` (mặc định, giữ nguyên giao diện gốc), `clay` (bo tròn, bóng đôi mềm), `soft` (phẳng, bóng mờ), `glass` (kính mờ, chỉ hợp nền tối), `neo` (viền dày, bóng cứng). Mỗi skin là một bộ biến CSS (`--radius`, `--card-shadow`, `--btn-shadow`...) khai báo trong `src/cosmetics/core/css.ts`; `globals.css` chỉ đọc biến, nên thêm skin = thêm một dòng ở đó.
- `pattern`: ngoài `grid | dots | none` còn có `aurora | mesh | waves | diagonal | stars | petals | sunset`. Các kiểu mới dựng từ token bằng `color-mix`, không dùng mã màu thô.

Scene đăng nhập cũng có `skin` riêng (không dùng `glass`), độc lập với theme người dùng chọn. Các trang đăng ký, quên mật khẩu, xác nhận, đặt lại mật khẩu dùng chung scene đang bật qua `AuthShell`.
