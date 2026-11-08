/**
 * Chọn Scene đăng nhập: hàm thuần (không DB, không registry) để test được.
 * Thứ tự ưu tiên: ghim thủ công → lịch tự động (giờ VN, độ ưu tiên khi trùng) → mặc định.
 * Xem trước (admin) và `?scene=` ở dev nằm ở tầng ngoài (features/login-scene/getActiveScene.ts), cao hơn cả ghim.
 */
export const DEFAULT_SCENE_KEY = "default";
export const SCENE_GREETING_MAX = 80;

export type SceneStatusDb = "draft" | "published";

export type SceneRow = {
  key: string;
  greeting: string | null;
  status: SceneStatusDb;
  pinned: boolean;
  motionEnabled: boolean;
};

/** Ngày theo giờ Việt Nam, dạng YYYY-MM-DD (cột `date` của DB). */
export type SceneSchedule = { id: number; sceneKey: string; startsOn: string; endsOn: string; priority: number };

export type SceneConfig = { scenes: SceneRow[]; schedules: SceneSchedule[] };
export const EMPTY_CONFIG: SceneConfig = { scenes: [], schedules: [] };

export type SceneSource = "pinned" | "schedule" | "default";
export type ResolvedScene = { key: string; source: SceneSource; row: SceneRow | null };

const VN_OFFSET_MS = 7 * 3600 * 1000; // Việt Nam không có giờ mùa hè

/** Ngày hiện tại ở Việt Nam, YYYY-MM-DD. */
export function vnDate(now: Date): string {
  return new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

export const isIsoDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/**
 * @param known  scene có thật trong code (scene đã bị xóa khỏi code thì bỏ qua, không làm hỏng trang đăng nhập)
 */
export function resolveSceneKey(now: Date, cfg: SceneConfig, known: (key: string) => boolean): ResolvedScene {
  const usable = new Map(cfg.scenes.filter((s) => s.status === "published" && known(s.key)).map((s) => [s.key, s]));

  const pinned = [...usable.values()].find((s) => s.pinned);
  if (pinned) return { key: pinned.key, source: "pinned", row: pinned };

  const today = vnDate(now);
  const live = cfg.schedules
    .filter((c) => usable.has(c.sceneKey) && c.startsOn <= today && today <= c.endsOn)
    // Trùng lịch: ưu tiên cao hơn thắng; bằng nhau thì lịch bắt đầu muộn hơn (cụ thể hơn) thắng; cuối cùng theo tên cho ổn định.
    .sort((a, b) => b.priority - a.priority || (a.startsOn < b.startsOn ? 1 : a.startsOn > b.startsOn ? -1 : 0) || a.sceneKey.localeCompare(b.sceneKey));
  const top = live[0];
  if (top) return { key: top.sceneKey, source: "schedule", row: usable.get(top.sceneKey)! };

  return { key: DEFAULT_SCENE_KEY, source: "default", row: cfg.scenes.find((s) => s.key === DEFAULT_SCENE_KEY) ?? null };
}

export type SceneStatus = "active" | "scheduled" | "published" | "draft" | "expired";
export const SCENE_STATUS_LABEL: Record<SceneStatus, string> = {
  active: "Đang hiển thị",
  scheduled: "Đã lên lịch",
  published: "Đã xuất bản, chưa có lịch",
  draft: "Nháp",
  expired: "Hết hạn",
};

/** Trạng thái hiển thị cho trang quản trị. `activeKey` = kết quả của resolveSceneKey. */
export function sceneStatus(key: string, now: Date, cfg: SceneConfig, activeKey: string): SceneStatus {
  if (key === activeKey) return "active";
  if (key === DEFAULT_SCENE_KEY) return "published";
  const row = cfg.scenes.find((s) => s.key === key);
  if (!row || row.status === "draft") return "draft";
  const today = vnDate(now);
  const mine = cfg.schedules.filter((c) => c.sceneKey === key);
  if (mine.some((c) => c.endsOn >= today)) return "scheduled";
  if (mine.length > 0) return "expired";
  return "published";
}
