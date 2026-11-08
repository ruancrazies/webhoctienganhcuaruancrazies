import type { LookCatalog, ManifestEntry } from "../core/cosmetics";
import { DARK_THEME_ID, DEFAULT_THEME_ID } from "./core/constants";
import type { AvatarDef, FrameDef, ThemeDef } from "./core/define";
import { AVATARS as RAW_AVATARS, FRAMES as RAW_FRAMES, THEMES as RAW_THEMES } from "./registry.generated";

/**
 * Registry: lõi chỉ biết hợp đồng (ThemeDef/AvatarDef/FrameDef), không biết từng món.
 * Danh sách thật nằm ở registry.generated.ts (sinh từ thư mục bởi `npm run gen:registry`).
 */
const bySort = <T extends { id: string; sort?: number }>(list: T[]): T[] =>
  [...list].sort((a, b) => (a.sort ?? 100) - (b.sort ?? 100) || a.id.localeCompare(b.id));

export const THEMES: ThemeDef[] = bySort(RAW_THEMES);
export const AVATARS: AvatarDef[] = bySort(RAW_AVATARS);
export const FRAMES: FrameDef[] = bySort(RAW_FRAMES);

export { DARK_THEME_ID, DEFAULT_THEME_ID };

const isActive = (x: { active?: boolean }) => x.active !== false;

export const themeById = (id: string | null | undefined): ThemeDef | undefined => THEMES.find((t) => t.id === id);
export const avatarById = (id: string | null | undefined): AvatarDef | undefined => AVATARS.find((a) => a.id === id);
export const frameById = (id: string | null | undefined): FrameDef | undefined => FRAMES.find((f) => f.id === id);

/** id lạ (đã bị xóa khỏi code) hoặc ngừng cung cấp → theme mặc định. */
export function resolveThemeId(id: string | null | undefined): string {
  const t = themeById(id);
  return t && isActive(t) ? t.id : DEFAULT_THEME_ID;
}

/** Thông tin tối thiểu cho client (không kèm token, để bundle không phình khi có nhiều theme). */
export type ThemeOption = { id: string; name: string; scheme: "light" | "dark"; group: ThemeDef["group"] };
export const themeOptions = (): ThemeOption[] => THEMES.filter(isActive).map(({ id, name, scheme, group }) => ({ id, name, scheme, group }));

/** Mã theme có trong code (kể cả ngừng cung cấp). Quyền dùng do server kiểm theo sở hữu, không do hàm này. */
export const isKnownTheme = (id: string): boolean => !!themeById(id);

/** Toàn bộ món trong code dưới dạng manifest chung (dùng để đồng bộ DB và gộp với bản admin chỉnh). */
export function manifestEntries(): ManifestEntry[] {
  const base = (x: { id: string; name: string; unlock: ManifestEntry["unlock"]; active?: boolean }) => ({ id: x.id, name: x.name, unlock: x.unlock, active: isActive(x) });
  return [
    ...THEMES.map((t): ManifestEntry => ({ ...base(t), kind: "theme", rarity: null, durationDays: null })),
    ...AVATARS.map((a): ManifestEntry => ({ ...base(a), kind: "avatar", rarity: null, durationDays: a.durationDays ?? null })),
    ...FRAMES.map((f): ManifestEntry => ({ ...base(f), kind: "frame", rarity: f.rarity, durationDays: f.durationDays ?? null })),
  ];
}

/** Bản nhẹ của manifest cho resolveLook (không cần DB). */
export function lookCatalog(): LookCatalog {
  return new Map(manifestEntries().map((m) => [m.id, { kind: m.kind, unlock: m.unlock, active: m.active }]));
}
