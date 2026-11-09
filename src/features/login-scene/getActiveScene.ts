import "server-only";
import { unstable_cache } from "next/cache";
import { withTimeout } from "../../core/withTimeout";
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

/** Quá hạn này mà DB chưa trả lời thì vẽ trang bằng scene mặc định (đo ở giai đoạn 4: DB treo làm /login chậm thêm cả giây). */
export const SCENE_CONFIG_TIMEOUT_MS = 1200;
/** Sau một lần lỗi/quá hạn, trong khoảng này không chờ DB nữa (khỏi bắt mọi lượt đăng nhập cùng chịu 1,2 giây khi DB đang sự cố). */
export const SCENE_CONFIG_BACKOFF_MS = 15_000;

const FAILED: unique symbol = Symbol("scene-config-failed");
let skipUntil = 0;

/**
 * Đọc cấu hình; DB lỗi HOẶC chậm thì trả cấu hình rỗng (→ scene mặc định) để trang đăng nhập không bao giờ hỏng hay chờ lâu.
 * Truy vấn chậm vẫn chạy tiếp ở nền và được cache nếu thành công, nên lượt sau có đúng scene.
 */
export async function loadSceneConfig(): Promise<SceneConfig> {
  if (Date.now() < skipUntil) return EMPTY_CONFIG;
  const attempt = cachedConfig().catch((e: unknown): typeof FAILED => {
    console.error("[login-scene] không đọc được cấu hình, dùng scene mặc định", e);
    return FAILED;
  });
  const r = await withTimeout<SceneConfig | typeof FAILED>(attempt, SCENE_CONFIG_TIMEOUT_MS, FAILED);
  if (r === FAILED) {
    skipUntil = Date.now() + SCENE_CONFIG_BACKOFF_MS;
    return EMPTY_CONFIG;
  }
  return r;
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
