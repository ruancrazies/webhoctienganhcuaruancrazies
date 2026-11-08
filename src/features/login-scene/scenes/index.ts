import { DEFAULT_SCENE_KEY } from "../../../core/loginScene";
import { SCENES as RAW } from "./registry.generated";
import type { SceneMeta } from "./types";

/**
 * Registry NHẸ của Scene (chạy ở server): chỉ scene.ts + scene.css. draw.ts nặng nằm ở draw-loaders.generated.ts, chỉ client nạp.
 * Danh sách thật do `npm run gen:registry` sinh từ thư mục scenes/.
 */
export const SCENES: SceneMeta[] = [...RAW].sort((a, b) => (a.sort ?? 100) - (b.sort ?? 100) || a.id.localeCompare(b.id));

const isActive = (s: SceneMeta) => s.active !== false;

export const sceneById = (id: string | null | undefined): SceneMeta | undefined => SCENES.find((s) => s.id === id);
/** Scene chọn được: có trong code và chưa ngừng cung cấp. */
export const isKnownScene = (id: string): boolean => {
  const s = sceneById(id);
  return !!s && isActive(s);
};
/** Luôn có (test bảo đảm): chỗ rơi về cuối cùng. */
export const defaultScene = (): SceneMeta => sceneById(DEFAULT_SCENE_KEY)!;
