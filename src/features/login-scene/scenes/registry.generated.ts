// Tệp SINH TỰ ĐỘNG bởi `npm run gen:registry` (chạy trong prebuild). KHÔNG sửa tay.
// Thêm scene = thêm một thư mục trong src/features/login-scene/scenes (xem docs/login-scene.md).
import type { SceneMeta } from "./types";
import scene_default from "./default/scene";
import "./default/scene.css";
import scene_giang_sinh from "./giang-sinh/scene";
import "./giang-sinh/scene.css";
import scene_halloween from "./halloween/scene";
import "./halloween/scene.css";

export const SCENES: SceneMeta[] = [scene_default, scene_giang_sinh, scene_halloween];
