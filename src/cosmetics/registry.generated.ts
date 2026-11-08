// Tệp SINH TỰ ĐỘNG bởi `npm run gen:registry` (chạy trong prebuild). KHÔNG sửa tay.
// Thêm theme/avatar/khung = thêm một thư mục trong src/cosmetics (xem docs/cosmetics.md).
import type { AvatarDef, FrameDef, ThemeDef } from "./core/define";
import theme_dark from "./themes/dark/theme";
import theme_paper from "./themes/paper/theme";

export const THEMES: ThemeDef[] = [theme_dark, theme_paper];
export const AVATARS: AvatarDef[] = [];
export const FRAMES: FrameDef[] = [];
