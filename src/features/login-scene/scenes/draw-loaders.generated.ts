// Tệp SINH TỰ ĐỘNG bởi `npm run gen:registry` (chạy trong prebuild). KHÔNG sửa tay.
import type { SceneDraw } from "./types";

export const DRAW_LOADERS: Record<string, () => Promise<{ default: SceneDraw }>> = {
  "giang-sinh": () => import("./giang-sinh/draw"),
  "halloween": () => import("./halloween/draw"),
  "khai-giang": () => import("./khai-giang/draw"),
  "tet": () => import("./tet/draw"),
  "trung-thu": () => import("./trung-thu/draw"),
};
