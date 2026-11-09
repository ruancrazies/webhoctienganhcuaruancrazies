// Tệp SINH TỰ ĐỘNG bởi `npm run gen:registry` (chạy trong prebuild). KHÔNG sửa tay.
// Thêm theme/avatar/khung = thêm một thư mục trong src/cosmetics (xem docs/cosmetics.md).
import type { AvatarDef, FrameDef, ThemeDef } from "./core/define";
import theme_aurora from "./themes/aurora/theme";
import theme_candy from "./themes/candy/theme";
import theme_dark from "./themes/dark/theme";
import theme_forest from "./themes/forest/theme";
import theme_matcha from "./themes/matcha/theme";
import theme_mocha from "./themes/mocha/theme";
import theme_neon from "./themes/neon/theme";
import theme_ocean from "./themes/ocean/theme";
import theme_paper from "./themes/paper/theme";
import theme_pop from "./themes/pop/theme";
import theme_sakura from "./themes/sakura/theme";
import theme_sunset from "./themes/sunset/theme";
import theme_twilight from "./themes/twilight/theme";
import frame_candy_cane from "./frames/candy-cane/frame";
import frame_snow_ring from "./frames/snow-ring/frame";

export const THEMES: ThemeDef[] = [theme_aurora, theme_candy, theme_dark, theme_forest, theme_matcha, theme_mocha, theme_neon, theme_ocean, theme_paper, theme_pop, theme_sakura, theme_sunset, theme_twilight];
export const AVATARS: AvatarDef[] = [];
export const FRAMES: FrameDef[] = [frame_candy_cane, frame_snow_ring];
