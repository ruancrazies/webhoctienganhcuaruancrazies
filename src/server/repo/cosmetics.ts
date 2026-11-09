import { createAdminClient } from "../db";
import type { CosmeticKind, DbCatalogRow, GrantSource, OwnedRow } from "../../core/cosmetics";
import type { Unlock } from "../../cosmetics/core/unlock";
import { unwrap, unwrapList } from "./shared";

const db = () => createAdminClient();

type RawCatalog = { id: string; kind: CosmeticKind; unlock: Unlock; duration_days: number | null; available_from: string | null; available_until: string | null; active: boolean };
type RawOwned = { cosmetic_id: string; source: GrantSource; granted_at: string; expires_at: string | null; seen_at: string | null; warned: number };

const OWNED_COLS = "cosmetic_id,source,granted_at,expires_at,seen_at,warned";
const toOwned = (r: RawOwned): OwnedRow => ({ cosmeticId: r.cosmetic_id, source: r.source, grantedAt: r.granted_at, expiresAt: r.expires_at, seenAt: r.seen_at, warned: r.warned });

/** Danh mục trong DB (vài chục dòng). Phần admin chỉnh: luật mở khóa, hạn, cửa nhận, bật/tắt. */
export async function listCatalogRows(): Promise<DbCatalogRow[]> {
  const rows = unwrapList<RawCatalog>("cosmetics.list", await db().from("cosmetics").select("id,kind,unlock,duration_days,available_from,available_until,active"));
  return rows.map((r) => ({ id: r.id, kind: r.kind, unlock: r.unlock, durationDays: r.duration_days, availableFrom: r.available_from, availableUntil: r.available_until, active: r.active }));
}

/** Mọi món người dùng đã có (kể cả đã hết hạn: hết hạn do so với giờ ở lớp trên, không lọc ở đây). */
export async function listOwned(userId: string): Promise<OwnedRow[]> {
  return unwrapList<RawOwned>("user_cosmetics.list", await db().from("user_cosmetics").select(OWNED_COLS).eq("user_id", userId)).map(toOwned);
}

/** Món đã có của một nhóm nhỏ người dùng (bảng xếp hạng: 10 người). Người không có dòng nào vẫn có mục rỗng. */
export async function listOwnedForUsers(userIds: string[]): Promise<Map<string, OwnedRow[]>> {
  const out = new Map<string, OwnedRow[]>(userIds.map((id) => [id, []]));
  if (!userIds.length) return out;
  const rows = unwrapList<RawOwned & { user_id: string }>("user_cosmetics.forUsers", await db().from("user_cosmetics").select(`user_id,${OWNED_COLS}`).in("user_id", userIds));
  for (const r of rows) out.get(r.user_id)?.push(toOwned(r));
  return out;
}

/** Cấp mọi món `level` mà người dùng đủ level và chưa có. Chỉ thêm, không thu hồi. Trả mã các món vừa cấp. */
export async function syncLevelCosmetics(userId: string, level: number): Promise<string[]> {
  return unwrap<string[]>("sync_level_cosmetics", await db().rpc("sync_level_cosmetics", { p_user: userId, p_level: level })) ?? [];
}

/** Cấp một món (sự kiện, admin tặng). true = có thay đổi (mới nhận hoặc nhận lại sau hết hạn). Lỗi có mã: cosmetic_not_found / cosmetic_unavailable. */
export async function grantCosmetic(userId: string, cosmeticId: string, source: GrantSource): Promise<boolean> {
  return unwrap<boolean>("grant_cosmetic", await db().rpc("grant_cosmetic", { p_user: userId, p_cosmetic: cosmeticId, p_source: source })) === true;
}

/** Đánh dấu đã báo mở khóa. Chỉ trả những món mà LẦN GỌI NÀY vừa đổi, nên hai tab cùng gọi thì chỉ một bên được giao thông báo. */
export async function claimUnlockNotices(userId: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const rows = unwrapList<{ cosmetic_id: string }>(
    "user_cosmetics.claimSeen",
    await db().from("user_cosmetics").update({ seen_at: new Date().toISOString() }).eq("user_id", userId).in("cosmetic_id", ids).is("seen_at", null).select("cosmetic_id"),
  );
  return rows.map((r) => r.cosmetic_id);
}

/** Ghi bậc nhắc hạn đã báo (chỉ tăng). true nếu lần gọi này là bên đổi (được quyền giao thông báo). */
export async function claimWarnStage(userId: string, cosmeticId: string, stage: 1 | 2 | 3): Promise<boolean> {
  const rows = unwrapList<{ cosmetic_id: string }>(
    "user_cosmetics.claimWarn",
    await db().from("user_cosmetics").update({ warned: stage }).eq("user_id", userId).eq("cosmetic_id", cosmeticId).lt("warned", stage).select("cosmetic_id"),
  );
  return rows.length > 0;
}

/** Ghi bộ đang chọn của tài khoản (chỉ gọi sau khi service đã kiểm sở hữu). null = về mặc định. */
export async function updateLook(userId: string, patch: { theme?: string | null; avatar?: string | null; frame?: string | null }): Promise<void> {
  const row: Record<string, string | null> = {};
  if (patch.theme !== undefined) row.theme = patch.theme;
  if (patch.avatar !== undefined) row.avatar = patch.avatar;
  if (patch.frame !== undefined) row.frame = patch.frame;
  if (!Object.keys(row).length) return;
  unwrap("profiles.updateLook", await db().from("profiles").update(row).eq("id", userId));
}

/**
 * Màu nhấn đang chọn (mã thô trong DB). Cố ý tách khỏi getProfile: nếu migration 0021 chưa áp (hoặc DB lỗi) thì trả null,
 * giao diện giữ màu của theme thay vì làm hỏng khung (app) và mọi trang.
 */
export async function getAccentId(userId: string): Promise<string | null> {
  try {
    const { data, error } = await db().from("profiles").select("accent").eq("id", userId).maybeSingle();
    if (error) throw error;
    const v = (data as { accent: string | null } | null)?.accent;
    return typeof v === "string" ? v : null;
  } catch (e) {
    console.warn("[accent] không đọc được màu nhấn, dùng màu của theme", e);
    return null;
  }
}

/** Ghi màu nhấn (service/action đã kiểm mã với danh sách trong code). null = về màu của theme. */
export async function updateAccent(userId: string, accent: string | null): Promise<void> {
  unwrap("profiles.updateAccent", await db().from("profiles").update({ accent }).eq("id", userId));
}
