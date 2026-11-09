// Tệp SINH TỰ ĐỘNG bởi `npm run gen:registry` (chạy trong prebuild). KHÔNG sửa tay.
// Thêm scene = thêm một thư mục trong src/features/login-scene/scenes (xem docs/login-scene.md).
import type { SceneMeta } from "./types";
import scene_default from "./default/scene";
import "./default/scene.css";
import scene_giang_sinh from "./giang-sinh/scene";
import "./giang-sinh/scene.css";
import scene_halloween from "./halloween/scene";
import "./halloween/scene.css";
import scene_khai_giang from "./khai-giang/scene";
import "./khai-giang/scene.css";
import scene_mua_he from "./mua-he/scene";
import "./mua-he/scene.css";
import scene_tet from "./tet/scene";
import "./tet/scene.css";
import scene_trung_thu from "./trung-thu/scene";
import "./trung-thu/scene.css";
import scene_valentine from "./valentine/scene";
import "./valentine/scene.css";

export const SCENES: SceneMeta[] = [scene_default, scene_giang_sinh, scene_halloween, scene_khai_giang, scene_mua_he, scene_tet, scene_trung_thu, scene_valentine];
