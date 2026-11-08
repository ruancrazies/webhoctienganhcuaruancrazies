import { isAvatarId } from "../../core/avatars";
import {
  ackOf,
  isRowValid,
  isUsable,
  itemState,
  mergeCatalog,
  pendingNotices,
  resolveLook,
  THEME_AUTO,
  type CosmeticKind,
  type ItemState,
  type Look,
  type OwnedRow,
} from "../../core/cosmetics";
import { xpLevelOf } from "../../core/xpLevel";
import { DEFAULT_THEME_ID } from "../../cosmetics/core/constants";
import type { Rarity, ThemeGroup } from "../../cosmetics/core/define";
import { AVATARS, THEMES, lookCatalog, manifestEntries, type ThemeOption } from "../../cosmetics/registry";
import { noticeMessages, type NoticeMessage } from "../../lib/cosmeticText";
import { ServiceError } from "../errors";
import { COSMETIC_EQUIP_PER_HOUR, COSMETIC_POLL_PER_HOUR, HOUR } from "../limits";
import { hitRateLimit } from "../ratelimit";
import { claimUnlockNotices, claimWarnStage, getProfile, listCatalogRows, listOwned, listOwnedForUsers, syncLevelCosmetics, updateLook, type Profile } from "../repo";
import { nowOf, type Ctx } from "./ctx";
import { eventNames } from "./seasonEvents";

const nameById = (): Map<string, string> => new Map(manifestEntries().map((m) => [m.id, m.name]));

/** Cấp các món theo level (idempotent). Lỗi DB không được làm hỏng trang đang mở: ghi log rồi coi như chưa có gì mới. */
async function syncLevelSafe(userId: string, xp: number): Promise<string[]> {
  try {
    return await syncLevelCosmetics(userId, xpLevelOf(xp).level);
  } catch (e) {
    console.error("[cosmetics] đồng bộ quyền theo level thất bại", e);
    return [];
  }
}

// ---------------- bộ đang hiển thị ----------------

/** Bộ thực sự hiển thị của MỘT người (hồ sơ của chính mình): món hết hạn hoặc không thuộc về họ tự về mặc định. */
export async function getMyLook(profile: Pick<Profile, "id" | "theme" | "avatar" | "frame">, ctx: Ctx = {}): Promise<{ look: Look; owned: OwnedRow[]; reverted: number }> {
  const owned = await listOwned(profile.id);
  const r = resolveLook(profile, { now: nowOf(ctx), catalog: lookCatalog(), owned, legacyAvatar: isAvatarId });
  return { look: r.look, owned, reverted: r.reverted.length };
}

/** Avatar + khung mà NGƯỜI KHÁC nhìn thấy (bảng xếp hạng): chỉ món còn hạn của chủ nhân. Theme là riêng tư nên không có ở đây. */
export async function publicLooks(people: { id: string; avatar: string | null; frame: string | null }[], ctx: Ctx = {}): Promise<Map<string, { avatar: string | null; frame: string | null }>> {
  const owned = await listOwnedForUsers(people.map((p) => p.id));
  const catalog = lookCatalog();
  const now = nowOf(ctx);
  return new Map(
    people.map((p) => {
      const { look } = resolveLook({ theme: null, avatar: p.avatar, frame: p.frame }, { now, catalog, owned: owned.get(p.id) ?? [], legacyAvatar: isAvatarId });
      return [p.id, { avatar: look.avatar, frame: look.frame }];
    }),
  );
}

/** Theme người này dùng được ngay (cho menu nhanh): mặc định + đã có còn hạn. */
export function usableThemeOptions(owned: readonly OwnedRow[], ctx: Ctx = {}): ThemeOption[] {
  const now = nowOf(ctx);
  const have = new Set(owned.filter((r) => isRowValid(r, now)).map((r) => r.cosmeticId));
  return THEMES.filter((t) => (t.unlock.type === "default" ? t.active !== false : have.has(t.id))).map(({ id, name, scheme, group }) => ({ id, name, scheme, group }));
}

// ---------------- Bộ sưu tập ----------------

export type CollectionItem = {
  id: string;
  kind: CosmeticKind;
  name: string;
  rarity: Rarity | null;
  group: ThemeGroup | null;
  series: string | null;
  /** Mã sự kiện nếu món nhận qua sự kiện (để lọc "Sự kiện"). */
  event: string | null;
  state: ItemState;
  equipped: boolean;
};

export type Collection = { username: string; xp: number; level: number; look: Look; items: CollectionItem[]; newCount: number; /** Mã sự kiện đang hiện → tên (cho dòng điều kiện nhận). */ eventNames: Record<string, string> };

/** Mọi món người này thấy được (đã có / hết hạn / chưa mở); món đã đóng và chưa có thì ẩn. Đồng bộ quyền theo level trước khi đọc. */
export async function getCollection(userId: string, ctx: Ctx = {}): Promise<Collection> {
  const now = nowOf(ctx);
  const profile = await getProfile(userId);
  if (!profile) throw new ServiceError(404, "NO_PROFILE", "Không tìm thấy hồ sơ người dùng");
  await syncLevelSafe(userId, profile.xp);
  const [dbRows, owned] = await Promise.all([listCatalogRows(), listOwned(userId)]);
  const catalog = mergeCatalog(manifestEntries(), dbRows);
  const rows = new Map(owned.map((r) => [r.cosmeticId, r]));
  const { look } = resolveLook(profile, { now, catalog: lookCatalog(), owned, legacyAvatar: isAvatarId });

  const group = new Map(THEMES.map((t) => [t.id, t.group]));
  const series = new Map(AVATARS.map((a) => [a.id, a.series]));
  const items: CollectionItem[] = [];
  for (const c of catalog) {
    const state = itemState(c, { now, xp: profile.xp, owned: rows.get(c.id) });
    if (state.status === "closed") continue;
    const equipped = c.kind === "theme" ? !look.auto && look.theme === c.id : c.kind === "avatar" ? look.avatar === c.id : look.frame === c.id;
    items.push({
      id: c.id,
      kind: c.kind,
      name: c.name,
      rarity: c.rarity,
      group: c.kind === "theme" ? (group.get(c.id) ?? null) : null,
      series: c.kind === "avatar" ? (series.get(c.id) ?? null) : null,
      event: c.unlock.type === "event" ? c.unlock.event : null,
      state,
      equipped,
    });
  }
  const shown = new Set(items.map((i) => i.id));
  const newCount = owned.filter((r) => r.seenAt === null && isRowValid(r, now) && shown.has(r.cosmeticId)).length;
  const names = items.some((i) => i.event !== null) ? await eventNames(ctx) : new Map<string, string>();
  return { username: profile.username, xp: profile.xp, level: xpLevelOf(profile.xp).level, look, items, newCount, eventNames: Object.fromEntries(names) };
}

/** Số món mới chưa được báo (huy hiệu ở trang Tôi khi người dùng tắt thú cưng nên không nhận được thông báo). */
export async function countUnseen(userId: string, ctx: Ctx = {}): Promise<number> {
  const now = nowOf(ctx);
  return (await listOwned(userId)).filter((r) => r.seenAt === null && isRowValid(r, now)).length;
}

// ---------------- chọn dùng ----------------

const NOT_YOURS = "Bạn chưa có món này.";

/**
 * Chọn dùng một món (hoặc bỏ). Server kiểm lại TẤT CẢ: món có trong code, đúng loại, và người này đang sở hữu còn hạn
 * (hoặc là món mặc định). Không tin dữ liệu từ client. `id` null = về mặc định (avatar → chữ cái đầu, khung → không khung,
 * theme → Vở ô ly). Theme còn nhận "auto" (theo thiết bị). Trả bộ hiển thị mới.
 */
export async function equipCosmetic(userId: string, kind: CosmeticKind, id: string | null, ctx: Ctx = {}): Promise<Look> {
  if (!(await hitRateLimit(`cosmetic-equip:${userId}`, HOUR, COSMETIC_EQUIP_PER_HOUR))) {
    throw new ServiceError(429, "RATE_LIMITED", "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.");
  }
  const now = nowOf(ctx);
  const profile = await getProfile(userId);
  if (!profile) throw new ServiceError(404, "NO_PROFILE", "Không tìm thấy hồ sơ người dùng");

  let value: string | null = id;
  if (kind === "theme" && id === null) value = DEFAULT_THEME_ID;
  if (value !== null && !(kind === "theme" && value === THEME_AUTO)) {
    await syncLevelSafe(userId, profile.xp); // vừa lên level mà trang chưa kịp đồng bộ vẫn chọn được
    const [dbRows, owned] = await Promise.all([listCatalogRows(), listOwned(userId)]);
    const item = mergeCatalog(manifestEntries(), dbRows).find((c) => c.id === value);
    if (!item || item.kind !== kind) throw new ServiceError(400, "INVALID_COSMETIC", "Món này không tồn tại.");
    const state = itemState(item, { now, xp: profile.xp, owned: owned.find((r) => r.cosmeticId === value) });
    if (!isUsable(state)) throw new ServiceError(403, "NOT_OWNED", state.status === "expired" ? "Món này đã hết hạn." : NOT_YOURS);
  }

  await updateLook(userId, { [kind]: value });
  const next = { theme: profile.theme, avatar: profile.avatar, frame: profile.frame, [kind]: value };
  const owned = await listOwned(userId);
  return resolveLook(next, { now, catalog: lookCatalog(), owned, legacyAvatar: isAvatarId }).look;
}

// ---------------- thông báo + đồng bộ (trình duyệt hỏi định kỳ) ----------------

export type PollResult = {
  /** Câu thú cưng sẽ nói (đã gộp, đã đánh dấu đã giao). Rỗng khi người dùng tắt thú cưng (không đánh dấu, để không mất). */
  messages: NoticeMessage[];
  /** Theme server cho là đúng ("auto" hoặc mã); null = đừng đổi gì. */
  theme: string | null;
  /** Có gì thay đổi ở dữ liệu hiển thị (cấp món mới, món hết hạn bị gỡ): trang nên làm mới. */
  changed: boolean;
};
const NOTHING: PollResult = { messages: [], theme: null, changed: false };

/**
 * Việc nền của khung (app), gọi ít nhất cách nhau một phút:
 *  1) cấp món theo level mới đạt (đồng bộ lười, không cần chạm vào luồng học/thi);
 *  2) gỡ món đã hết hạn khỏi bộ đang chọn (ghi vào hồ sơ để nhận lại sau không tự bật lại);
 *  3) đồng bộ theme giữa thiết bị: hồ sơ là gốc; hồ sơ chưa có theme thì nhận theme của cookie (người dùng cũ);
 *  4) giao thông báo mở khóa / sắp hết hạn / hết hạn, mỗi loại đúng một lần (`ack` = thú cưng đang bật).
 */
export async function pollCosmetics(userId: string, opts: { ack: boolean; cookieTheme?: string }, ctx: Ctx = {}): Promise<PollResult> {
  if (!(await hitRateLimit(`cosmetic-poll:${userId}`, HOUR, COSMETIC_POLL_PER_HOUR))) return NOTHING;
  const now = nowOf(ctx);
  const profile = await getProfile(userId);
  if (!profile) return NOTHING;

  const granted = await syncLevelSafe(userId, profile.xp);
  const owned = await listOwned(userId);
  const catalog = lookCatalog();

  const proposed = profile.theme ?? opts.cookieTheme ?? null;
  const { look, reverted } = resolveLook({ theme: proposed, avatar: profile.avatar, frame: profile.frame }, { now, catalog, owned, legacyAvatar: isAvatarId });
  const wanted = look.auto ? THEME_AUTO : look.theme;

  const patch: { theme?: string; avatar?: null; frame?: null } = {};
  if ((profile.theme !== null || opts.cookieTheme !== undefined) && profile.theme !== wanted) patch.theme = wanted;
  for (const r of reverted) if (r.kind === "avatar") patch.avatar = null;
  for (const r of reverted) if (r.kind === "frame") patch.frame = null;
  if (Object.keys(patch).length) await updateLook(userId, patch);

  let delivered = opts.ack ? pendingNotices(owned, now, (id) => catalog.has(id)) : [];
  if (delivered.length) {
    const { seen, warned } = ackOf(delivered);
    const gotSeen = new Set(await claimUnlockNotices(userId, seen));
    const gotWarn = new Set<string>();
    for (const w of warned) if (await claimWarnStage(userId, w.id, w.stage)) gotWarn.add(w.id);
    delivered = delivered.filter((n) => (n.kind === "unlock" ? gotSeen.has(n.id) : gotWarn.has(n.id)));
  }
  const names = nameById();
  return {
    messages: noticeMessages(delivered, (id) => names.get(id) ?? id),
    theme: wanted,
    changed: granted.length > 0 || reverted.length > 0,
  };
}
