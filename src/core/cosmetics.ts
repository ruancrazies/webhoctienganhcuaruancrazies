/**
 * Cosmetic (theme, avatar, khung): quy tắc thuần, dùng được ở server lẫn client, không đụng DB.
 *
 *  • mergeCatalog   manifest trong code + dòng `cosmetics` trong DB (admin chỉnh được) → danh mục hiệu lực
 *  • itemState      một món đang ở trạng thái nào với một người (đã có / hết hạn / khóa / đã đóng)
 *  • resolveLook    bộ đang chọn → bộ thực sự hiển thị (món hết hạn hoặc không thuộc về người đó tự về mặc định)
 *  • pendingNotices các thông báo còn nợ (mở khóa, sắp hết hạn, hết hạn), mỗi loại đúng một lần
 *
 * Hạn dùng luôn so với `now` do server đưa vào mỗi lần đọc: không có job nền nên không có độ trễ.
 */
import type { Rarity } from "../cosmetics/core/define";
import type { Unlock } from "../cosmetics/core/unlock";
import { DEFAULT_THEME_ID } from "../cosmetics/core/constants";
import { MAX_XP_LEVEL, xpToReach } from "./xpLevel";

export type CosmeticKind = "theme" | "avatar" | "frame";
export const COSMETIC_KINDS: readonly CosmeticKind[] = ["theme", "avatar", "frame"];
export const isCosmeticKind = (v: unknown): v is CosmeticKind => v === "theme" || v === "avatar" || v === "frame";

export type GrantSource = "level" | "event" | "grant";
export const DAY_MS = 86_400_000;
/** "Mới" hiện trên món trong 3 ngày kể từ lúc nhận (hoặc cho tới khi đã được báo). */
export const NEW_WINDOW_MS = 3 * DAY_MS;
/** Giá trị của profiles.theme khi người dùng bật "Tự động theo thiết bị". */
export const THEME_AUTO = "auto";

// ---------------- danh mục ----------------

/** Phần mặc định khai báo trong code (manifest). */
export type ManifestEntry = {
  id: string;
  kind: CosmeticKind;
  name: string;
  rarity: Rarity | null;
  unlock: Unlock;
  durationDays: number | null;
  active: boolean;
};

/** Dòng trong bảng `cosmetics` (phần admin chỉnh được). */
export type DbCatalogRow = {
  id: string;
  kind: CosmeticKind;
  unlock: Unlock;
  durationDays: number | null;
  availableFrom: string | null;
  availableUntil: string | null;
  active: boolean;
};

export type CatalogItem = ManifestEntry & {
  availableFrom: string | null;
  availableUntil: string | null;
  /** false = manifest chưa được đồng bộ vào DB (chạy `npm run cosmetics:sync`): món cấp theo luật sẽ chưa mở được. */
  synced: boolean;
};

/**
 * Tên và độ hiếm lấy từ code; luật mở khóa, hạn, cửa nhận, bật/tắt lấy từ DB nếu đã có dòng, nếu chưa thì theo manifest.
 * Dòng DB không có trong manifest (món đã xóa khỏi code) bị bỏ qua.
 */
export function mergeCatalog(manifest: readonly ManifestEntry[], db: readonly DbCatalogRow[]): CatalogItem[] {
  const byId = new Map(db.map((r) => [r.id, r]));
  return manifest.map((m) => {
    const r = byId.get(m.id);
    if (!r || r.kind !== m.kind) return { ...m, availableFrom: null, availableUntil: null, synced: false };
    return { ...m, unlock: r.unlock, durationDays: r.durationDays, active: r.active, availableFrom: r.availableFrom, availableUntil: r.availableUntil, synced: true };
  });
}

// ---------------- quyền sở hữu ----------------

/** Một dòng user_cosmetics. */
export type OwnedRow = {
  cosmeticId: string;
  source: GrantSource;
  grantedAt: string;
  expiresAt: string | null;
  seenAt: string | null;
  /** Bậc nhắc hạn đã báo: 1 = còn ≤ 7 ngày, 2 = còn ≤ 1 ngày, 3 = đã hết hạn. */
  warned: number;
};

export const isRowValid = (r: OwnedRow, now: Date): boolean => r.expiresAt === null || new Date(r.expiresAt).getTime() > now.getTime();

/** Số ngày còn lại (làm tròn lên, tối thiểu 1 khi còn hạn); null nếu vĩnh viễn hoặc đã hết. */
export function daysLeft(expiresAt: string | null, now: Date): number | null {
  if (expiresAt === null) return null;
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return ms > 0 ? Math.max(1, Math.ceil(ms / DAY_MS)) : null;
}

export type Acquire =
  | { type: "level"; level: number; xpLeft: number; ratio: number; reached: boolean }
  | { type: "event"; event: string }
  | { type: "grant" };

export type ItemState =
  | { status: "owned"; permanent: boolean; expiresAt: string | null; daysLeft: number | null; isNew: boolean }
  /** Từng có, đã hết hạn. `acquire` = cách nhận lại; null nếu hiện không còn cách nào. */
  | { status: "expired"; expiredAt: string; acquire: Acquire | null }
  | { status: "locked"; acquire: Acquire; opensAt: string | null }
  /** Ngừng cung cấp hoặc đã qua cửa nhận, và người này chưa có: không hiện trong Bộ sưu tập. */
  | { status: "closed" };

export type StateCtx = { now: Date; xp: number; owned: OwnedRow | undefined };

function acquireOf(item: Pick<CatalogItem, "unlock">, xp: number): Acquire | null {
  const u = item.unlock;
  if (u.type === "level") {
    const need = u.level >= 1 && u.level <= MAX_XP_LEVEL ? xpToReach(u.level) : null;
    const left = need === null ? 0 : Math.max(0, need - Math.max(0, Math.floor(xp)));
    return { type: "level", level: u.level, xpLeft: left, ratio: need ? Math.min(1, Math.max(0, xp) / need) : 0, reached: need !== null && left === 0 };
  }
  if (u.type === "event") return { type: "event", event: u.event };
  if (u.type === "grant") return { type: "grant" };
  return null; // default: không có "cách nhận"
}

/** Còn nhận được lúc này (hoặc sắp mở cửa nhận)? */
function obtainable(item: CatalogItem, now: Date): { ok: boolean; opensAt: string | null } {
  if (!item.active) return { ok: false, opensAt: null };
  if (item.availableUntil && now.getTime() > new Date(item.availableUntil).getTime()) return { ok: false, opensAt: null };
  if (item.availableFrom && now.getTime() < new Date(item.availableFrom).getTime()) return { ok: true, opensAt: item.availableFrom };
  return { ok: true, opensAt: null };
}

export function itemState(item: CatalogItem, ctx: StateCtx): ItemState {
  const { now, xp, owned } = ctx;
  if (owned) {
    if (isRowValid(owned, now)) {
      const left = daysLeft(owned.expiresAt, now);
      const fresh = owned.seenAt === null || now.getTime() - new Date(owned.grantedAt).getTime() < NEW_WINDOW_MS;
      return { status: "owned", permanent: owned.expiresAt === null, expiresAt: owned.expiresAt, daysLeft: left, isNew: fresh };
    }
    const can = obtainable(item, now);
    return { status: "expired", expiredAt: owned.expiresAt!, acquire: can.ok ? acquireOf(item, xp) : null };
  }
  if (item.unlock.type === "default") return item.active ? { status: "owned", permanent: true, expiresAt: null, daysLeft: null, isNew: false } : { status: "closed" };
  const can = obtainable(item, now);
  if (!can.ok) return { status: "closed" };
  const acquire = acquireOf(item, xp);
  return acquire ? { status: "locked", acquire, opensAt: can.opensAt } : { status: "closed" };
}

export type CollectionFilter = "all" | "owned" | "locked" | "event";

/** Bộ lọc của Bộ sưu tập: Đã có = dùng được ngay · Chưa mở = khóa hoặc đã hết hạn · Sự kiện = món nhận qua sự kiện. */
export function matchesFilter(s: ItemState, isEvent: boolean, f: CollectionFilter): boolean {
  if (f === "owned") return s.status === "owned";
  if (f === "locked") return s.status === "locked" || s.status === "expired";
  if (f === "event") return isEvent;
  return true;
}

/** Dùng được ngay? (Đã có và còn hạn.) Server luôn gọi hàm này trước khi ghi lựa chọn. */
export const isUsable = (s: ItemState): boolean => s.status === "owned";

// ---------------- bộ đang chọn → bộ hiển thị ----------------

export type Equipped = { theme: string | null; avatar: string | null; frame: string | null };
export type Look = { theme: string; auto: boolean; avatar: string | null; frame: string | null };
export type Reverted = { kind: CosmeticKind; id: string };

/** Thông tin tối thiểu về món để quyết định có dùng được không (lấy từ manifest). */
export type LookCatalog = ReadonlyMap<string, { kind: CosmeticKind; unlock: Unlock; active: boolean }>;

/**
 * Bộ thực sự hiển thị. Món không có trong danh mục (đã xóa khỏi code), không thuộc về người đó hoặc đã hết hạn → về mặc định
 * (theme: Vở ô ly; avatar/khung: không có) và được liệt kê trong `reverted` để báo. `legacyAvatar`: avatar emoji cũ
 * vẫn hiện nguyên cho tới khi migration chuyển sang bộ avatar minh họa (xem docs/giai-doan-2.md).
 */
export function resolveLook(eq: Equipped, ctx: { now: Date; catalog: LookCatalog; owned: readonly OwnedRow[]; legacyAvatar?: (id: string) => boolean }): { look: Look; reverted: Reverted[] } {
  const rows = new Map(ctx.owned.map((r) => [r.cosmeticId, r]));
  const reverted: Reverted[] = [];
  const usable = (kind: CosmeticKind, id: string): boolean => {
    const c = ctx.catalog.get(id);
    if (!c || c.kind !== kind) return false;
    if (c.unlock.type === "default") return c.active;
    const r = rows.get(id);
    return !!r && isRowValid(r, ctx.now);
  };
  const pick = (kind: CosmeticKind, id: string | null, fallback: string | null, legacy?: (id: string) => boolean): string | null => {
    if (id === null) return fallback;
    if (usable(kind, id)) return id;
    if (legacy?.(id)) return id;
    if (ctx.catalog.has(id)) reverted.push({ kind, id });
    return fallback;
  };

  let theme: string = DEFAULT_THEME_ID;
  let auto = false;
  if (eq.theme === THEME_AUTO) auto = true;
  else theme = pick("theme", eq.theme, DEFAULT_THEME_ID) ?? DEFAULT_THEME_ID;
  return { look: { theme, auto, avatar: pick("avatar", eq.avatar, null, ctx.legacyAvatar), frame: pick("frame", eq.frame, null) }, reverted };
}

// ---------------- thông báo ----------------

export type Notice =
  | { kind: "unlock"; id: string }
  /** stage 1: còn ≤ 7 ngày · stage 2: còn ≤ 1 ngày. */
  | { kind: "soon"; id: string; stage: 1 | 2; daysLeft: number }
  | { kind: "expired"; id: string };

/** Thông báo còn nợ, mỗi loại đúng một lần cho mỗi lần nhận (cờ seen_at/warned do server ghi sau khi giao). Chỉ món còn trong code. */
export function pendingNotices(rows: readonly OwnedRow[], now: Date, known: (id: string) => boolean): Notice[] {
  const out: Notice[] = [];
  for (const r of rows) {
    if (!known(r.cosmeticId)) continue;
    if (isRowValid(r, now)) {
      if (r.seenAt === null) out.push({ kind: "unlock", id: r.cosmeticId });
      if (r.expiresAt !== null) {
        const ms = new Date(r.expiresAt).getTime() - now.getTime();
        const stage = ms <= DAY_MS ? 2 : ms <= 7 * DAY_MS ? 1 : 0;
        if (stage > r.warned) out.push({ kind: "soon", id: r.cosmeticId, stage: stage as 1 | 2, daysLeft: daysLeft(r.expiresAt, now) ?? 1 });
      }
    } else if (r.warned < 3) {
      out.push({ kind: "expired", id: r.cosmeticId });
    }
  }
  return out;
}

/** Cờ cần ghi sau khi đã giao thông báo. */
export function ackOf(notices: readonly Notice[]): { seen: string[]; warned: { id: string; stage: 1 | 2 | 3 }[] } {
  const seen: string[] = [];
  const warned = new Map<string, 1 | 2 | 3>();
  for (const n of notices) {
    if (n.kind === "unlock") seen.push(n.id);
    else {
      const stage = n.kind === "expired" ? 3 : n.stage;
      warned.set(n.id, Math.max(warned.get(n.id) ?? 0, stage) as 1 | 2 | 3);
    }
  }
  return { seen, warned: [...warned].map(([id, stage]) => ({ id, stage })) };
}
