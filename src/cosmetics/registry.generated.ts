// Tệp SINH TỰ ĐỘNG bởi `npm run gen:registry` (chạy trong prebuild). KHÔNG sửa tay.
// Thêm theme/avatar/khung = thêm một thư mục trong src/cosmetics (xem docs/cosmetics.md).
import type { AvatarDef, FrameDef, ThemeDef } from "./core/define";
import theme_candy from "./themes/candy/theme";
import theme_dark from "./themes/dark/theme";
import theme_forest from "./themes/forest/theme";
import theme_paper from "./themes/paper/theme";
import theme_twilight from "./themes/twilight/theme";
import frame_candy_cane from "./frames/candy-cane/frame";
import frame_snow_ring from "./frames/snow-ring/frame";

export const THEMES: ThemeDef[] = [theme_candy, theme_dark, theme_forest, theme_paper, theme_twilight];
export const AVATARS: AvatarDef[] = [];
export const FRAMES: FrameDef[] = [frame_candy_cane, frame_snow_ring];
