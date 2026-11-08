import "server-only";
import { unstable_cache } from "next/cache";
import { EMPTY_CONFIG, resolveSceneKey, type SceneConfig, type SceneRow, type SceneSource } from "../../core/loginScene";
import { getSceneConfig } from "../../server/repo/scenes";
import { defaultScene, isKnownScene, sceneById } from "./scenes";
import type { SceneMeta } from "./scenes/types";

/** Tag cache: server action của admin gọi updateTag(SCENES_TAG) nên đổi Scene có hiệu lực ngay, không ai phải chờ. */
export const SCENES_TAG = "login-scenes";

/**
 * Cấu hình Scene được cache theo tag. Ta cache DỮ LIỆU (vài dòng) chứ không cache kết quả chọn, nên mốc đổi lịch (nửa đêm giờ VN)
 * luôn đúng mà trang đăng nhập vẫn không phải hỏi DB mỗi lượt. `revalidate` là lưới an toàn nếu có ai sửa DB bằng SQL tay.
 */
const cachedConfig = unstable_cache(() => getSceneConfig(), ["login-scene-config"], { tags: [SCENES_TAG], revalidate: 300 });

/** Đọc cấu hình; DB lỗi thì trả cấu hình rỗng (→ scene mặc định) để trang đăng nhập không bao giờ hỏng. */
export async function loadSceneConfig(): Promise<SceneConfig> {
  try {
    return await cachedConfig();
  } catch (e) {
    console.error("[login-scene] không đọc được cấu hình, dùng scene mặc định", e);
    return EMPTY_CONFIG;
  }
}

export type SceneView = {
  meta: SceneMeta;
  greeting: string;
  /** Có chạy canvas không: scene có phần canvas VÀ admin chưa tắt. (Người dùng bật giảm chuyển động thì client tự bỏ.) */
  motion: boolean;
};

/** Ghép scene trong code với dòng cấu hình của admin (câu chào đã sửa, bật/tắt hiệu ứng). */
export function sceneView(meta: SceneMeta, row: SceneRow | null | undefined): SceneView {
  const g = row?.greeting?.trim();
  return { meta, greeting: g || meta.greeting, motion: !!meta.canvas && row?.motionEnabled !== false };
}

export type ActiveScene = SceneView & { source: SceneSource | "dev" };

/**
 * Scene hiển thị ở /login. Thứ tự: (dev) ?scene= → ghim → lịch → mặc định.
 * Xem trước của admin KHÔNG đi qua /login (proxy đưa người đã đăng nhập ra khỏi /login): xem /admin/scenes/<id>/preview.
 * `?scene=` chỉ có tác dụng ngoài production.
 */
export async function getActiveScene(opts: { devScene?: string; now?: Date } = {}): Promise<ActiveScene> {
  const cfg = await loadSceneConfig();
  if (process.env.NODE_ENV !== "production" && opts.devScene && isKnownScene(opts.devScene)) {
    const meta = sceneById(opts.devScene)!;
    return { ...sceneView(meta, cfg.scenes.find((s) => s.key === meta.id)), source: "dev" };
  }
  const r = resolveSceneKey(opts.now ?? new Date(), cfg, isKnownScene);
  const meta = sceneById(r.key) ?? defaultScene();
  return { ...sceneView(meta, r.row), source: r.source };
}
