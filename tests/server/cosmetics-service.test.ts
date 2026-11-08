import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnedRow } from "../../src/core/cosmetics";
import { xpToReach } from "../../src/core/xpLevel";

/** Service cosmetic: repo và giới hạn tần suất đều giả; dùng danh mục thật trong src/cosmetics (paper, dark, forest Lv10, candy Lv15, twilight Lv20). */
const repo = vi.hoisted(() => ({
  getProfile: vi.fn(),
  listCatalogRows: vi.fn(),
  listOwned: vi.fn(),
  listOwnedForUsers: vi.fn(),
  syncLevelCosmetics: vi.fn(),
  updateLook: vi.fn(),
  claimUnlockNotices: vi.fn(),
  claimWarnStage: vi.fn(),
}));
vi.mock("../../src/server/repo", () => repo);
const rate = vi.hoisted(() => ({ hitRateLimit: vi.fn() }));
vi.mock("../../src/server/ratelimit", () => rate);

import { ServiceError } from "../../src/server/errors";
import { equipCosmetic, getCollection, pollCosmetics, publicLooks, usableThemeOptions } from "../../src/server/services/cosmetics";

const ME = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-11-08T03:00:00Z");
const ctx = { now: NOW };
const iso = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();
const row = (id: string, o: Partial<OwnedRow> = {}): OwnedRow => ({ cosmeticId: id, source: "level", grantedAt: iso(-30), expiresAt: null, seenAt: iso(-29), warned: 0, ...o });
const profile = (o: Record<string, unknown> = {}) => ({ id: ME, username: "Alice_01", avatar: null, theme: null, frame: null, xp: xpToReach(12), streak: 0, bestStreak: 0, lastDay: null, ...o });

let owned: OwnedRow[];
beforeEach(() => {
  vi.resetAllMocks();
  owned = [];
  rate.hitRateLimit.mockResolvedValue(true);
  repo.getProfile.mockResolvedValue(profile());
  repo.listCatalogRows.mockResolvedValue([]); // chưa đồng bộ: dùng mặc định trong manifest
  repo.listOwned.mockImplementation(async () => owned);
  repo.syncLevelCosmetics.mockResolvedValue([]);
  repo.updateLook.mockResolvedValue(undefined);
  repo.claimUnlockNotices.mockImplementation(async (_u: string, ids: string[]) => ids);
  repo.claimWarnStage.mockResolvedValue(true);
});

describe("equipCosmetic", () => {
  it("món chưa có → 403 NOT_OWNED, không ghi gì", async () => {
    await expect(equipCosmetic(ME, "theme", "forest", ctx)).rejects.toMatchObject({ status: 403, code: "NOT_OWNED" });
    expect(repo.updateLook).not.toHaveBeenCalled();
  });

  it("đã có và còn hạn → ghi và trả bộ hiển thị mới", async () => {
    owned = [row("forest")];
    const look = await equipCosmetic(ME, "theme", "forest", ctx);
    expect(repo.updateLook).toHaveBeenCalledWith(ME, { theme: "forest" });
    expect(look.theme).toBe("forest");
  });

  it("đã hết hạn → từ chối với lời nhắn riêng", async () => {
    owned = [row("forest", { expiresAt: iso(-1) })];
    await expect(equipCosmetic(ME, "theme", "forest", ctx)).rejects.toMatchObject({ code: "NOT_OWNED", message: "Món này đã hết hạn." });
  });

  it("theme mặc định (paper, dark) ai cũng chọn được; null = về Vở ô ly; 'auto' = theo thiết bị", async () => {
    expect((await equipCosmetic(ME, "theme", "dark", ctx)).theme).toBe("dark");
    expect(repo.updateLook).toHaveBeenLastCalledWith(ME, { theme: "dark" });
    await equipCosmetic(ME, "theme", null, ctx);
    expect(repo.updateLook).toHaveBeenLastCalledWith(ME, { theme: "paper" });
    owned = [];
    const look = await equipCosmetic(ME, "theme", "auto", ctx);
    expect(repo.updateLook).toHaveBeenLastCalledWith(ME, { theme: "auto" });
    expect(look.auto).toBe(true);
  });

  it("id lạ hoặc sai loại → 400, kể cả khi người dùng đang có dòng sở hữu", async () => {
    owned = [row("forest")];
    await expect(equipCosmetic(ME, "theme", "khong-co", ctx)).rejects.toMatchObject({ status: 400 });
    await expect(equipCosmetic(ME, "frame", "forest", ctx)).rejects.toMatchObject({ status: 400 });
    await expect(equipCosmetic(ME, "avatar", "forest", ctx)).rejects.toMatchObject({ status: 400 });
    expect(repo.updateLook).not.toHaveBeenCalled();
  });

  it("bỏ avatar/khung (null) không cần sở hữu gì", async () => {
    await equipCosmetic(ME, "avatar", null, ctx);
    expect(repo.updateLook).toHaveBeenLastCalledWith(ME, { avatar: null });
    await equipCosmetic(ME, "frame", null, ctx);
    expect(repo.updateLook).toHaveBeenLastCalledWith(ME, { frame: null });
  });

  it("vừa lên level mà chưa kịp đồng bộ vẫn chọn được (đồng bộ trước khi kiểm)", async () => {
    repo.syncLevelCosmetics.mockImplementation(async () => {
      owned = [row("forest", { seenAt: null })];
      return ["forest"];
    });
    await expect(equipCosmetic(ME, "theme", "forest", ctx)).resolves.toMatchObject({ theme: "forest" });
    expect(repo.syncLevelCosmetics).toHaveBeenCalledWith(ME, 12);
  });

  it("admin tắt món (DB active=false): chưa có thì không chọn được, đã có thì vẫn dùng được", async () => {
    repo.listCatalogRows.mockResolvedValue([{ id: "forest", kind: "theme", unlock: { type: "level", level: 10 }, durationDays: null, availableFrom: null, availableUntil: null, active: false }]);
    await expect(equipCosmetic(ME, "theme", "forest", ctx)).rejects.toMatchObject({ code: "NOT_OWNED" });
    owned = [row("forest")];
    await expect(equipCosmetic(ME, "theme", "forest", ctx)).resolves.toMatchObject({ theme: "forest" });
  });

  it("vượt giới hạn tần suất → 429, không ghi", async () => {
    rate.hitRateLimit.mockResolvedValue(false);
    await expect(equipCosmetic(ME, "theme", "dark", ctx)).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED" });
    expect(repo.updateLook).not.toHaveBeenCalled();
  });

  it("không có hồ sơ → 404", async () => {
    repo.getProfile.mockResolvedValue(null);
    await expect(equipCosmetic(ME, "theme", "dark", ctx)).rejects.toBeInstanceOf(ServiceError);
  });
});

describe("getCollection", () => {
  it("level 12: Rừng đêm (Lv10) đã có, Kẹo ngọt (Lv15) khóa kèm số XP còn thiếu và tiến độ", async () => {
    owned = [row("forest")];
    const col = await getCollection(ME, ctx);
    const by = Object.fromEntries(col.items.map((i) => [i.id, i]));
    expect(by.forest!.state.status).toBe("owned");
    expect(by.paper!.state.status).toBe("owned");
    expect(by.candy!.state).toMatchObject({ status: "locked", acquire: { type: "level", level: 15 } });
    expect(col.level).toBe(12);
    expect(col.username).toBe("Alice_01");
  });

  it("đánh dấu món đang dùng; avatar/khung rỗng vì chưa có ảnh nào trong registry", async () => {
    owned = [row("forest")];
    repo.getProfile.mockResolvedValue(profile({ theme: "forest" }));
    const col = await getCollection(ME, ctx);
    expect(col.items.filter((i) => i.equipped).map((i) => i.id)).toEqual(["forest"]);
    expect(col.items.filter((i) => i.kind !== "theme")).toEqual([]);
  });

  it("theme đang dùng đã hết hạn → hiển thị Vở ô ly là đang dùng, món hết hạn nằm trong mục 'Chưa mở'", async () => {
    owned = [row("forest", { expiresAt: iso(-2) })];
    repo.getProfile.mockResolvedValue(profile({ theme: "forest" }));
    const col = await getCollection(ME, ctx);
    expect(col.items.find((i) => i.equipped)!.id).toBe("paper");
    expect(col.items.find((i) => i.id === "forest")!.state.status).toBe("expired");
  });

  it("bật tự động theo thiết bị: không món nào được đánh dấu đang dùng", async () => {
    repo.getProfile.mockResolvedValue(profile({ theme: "auto" }));
    const col = await getCollection(ME, ctx);
    expect(col.look.auto).toBe(true);
    expect(col.items.some((i) => i.equipped)).toBe(false);
  });

  it("món ngừng cung cấp mà chưa có thì ẩn; lỗi đồng bộ level không làm hỏng trang", async () => {
    repo.listCatalogRows.mockResolvedValue([{ id: "twilight", kind: "theme", unlock: { type: "level", level: 20 }, durationDays: null, availableFrom: null, availableUntil: null, active: false }]);
    repo.syncLevelCosmetics.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const col = await getCollection(ME, ctx);
    expect(col.items.some((i) => i.id === "twilight")).toBe(false);
    expect(col.items.length).toBeGreaterThan(0);
  });

  it("newCount đếm món chưa được báo", async () => {
    owned = [row("forest", { seenAt: null }), row("candy", { seenAt: iso(-1) })];
    expect((await getCollection(ME, ctx)).newCount).toBe(1);
  });
});

describe("pollCosmetics", () => {
  it("cấp theo level, báo mở khóa đúng một lần (chỉ thông báo món mà lần gọi này đánh dấu được)", async () => {
    owned = [row("forest", { seenAt: null })];
    const r = await pollCosmetics(ME, { ack: true }, ctx);
    expect(repo.syncLevelCosmetics).toHaveBeenCalledWith(ME, 12);
    expect(r.messages.map((m) => m.text)).toEqual(["Bạn vừa mở khóa “Rừng đêm”! Vào Bộ sưu tập để dùng nhé."]);
    expect(repo.claimUnlockNotices).toHaveBeenCalledWith(ME, ["forest"]);
  });

  it("hai tab cùng hỏi: bên thua cuộc đua (claim trả rỗng) không nhận thông báo", async () => {
    owned = [row("forest", { seenAt: null })];
    repo.claimUnlockNotices.mockResolvedValue([]);
    expect((await pollCosmetics(ME, { ack: true }, ctx)).messages).toEqual([]);
  });

  it("thú cưng tắt (ack=false): không giao và KHÔNG đánh dấu, để không mất thông báo", async () => {
    owned = [row("forest", { seenAt: null })];
    const r = await pollCosmetics(ME, { ack: false }, ctx);
    expect(r.messages).toEqual([]);
    expect(repo.claimUnlockNotices).not.toHaveBeenCalled();
    expect(repo.claimWarnStage).not.toHaveBeenCalled();
  });

  it("nhắc sắp hết hạn: ghi bậc nhắc và gộp thành một câu", async () => {
    owned = [row("forest", { source: "event", expiresAt: iso(5) }), row("candy", { source: "event", expiresAt: iso(6) })];
    const r = await pollCosmetics(ME, { ack: true }, ctx);
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]!.text).toContain("sắp hết hạn");
    expect(repo.claimWarnStage).toHaveBeenCalledWith(ME, "forest", 1);
    expect(repo.claimWarnStage).toHaveBeenCalledWith(ME, "candy", 1);
  });

  it("theme đang dùng đã hết hạn: gỡ về Vở ô ly trong hồ sơ, báo hết hạn, và báo trang làm mới", async () => {
    owned = [row("forest", { source: "event", expiresAt: iso(-1), warned: 2 })];
    repo.getProfile.mockResolvedValue(profile({ theme: "forest" }));
    const r = await pollCosmetics(ME, { ack: true, cookieTheme: "forest" }, ctx);
    expect(repo.updateLook).toHaveBeenCalledWith(ME, { theme: "paper" });
    expect(r).toMatchObject({ theme: "paper", changed: true });
    expect(r.messages[0]!.text).toContain("đã hết hạn");
  });

  it("hồ sơ chưa có theme: nhận theme từ cookie của thiết bị (người dùng cũ không mất giao diện)", async () => {
    const r = await pollCosmetics(ME, { ack: true, cookieTheme: "dark" }, ctx);
    expect(repo.updateLook).toHaveBeenCalledWith(ME, { theme: "dark" });
    expect(r.theme).toBe("dark");
  });

  it("hồ sơ chưa có theme và thiết bị chưa có cookie: không ghi gì", async () => {
    const r = await pollCosmetics(ME, { ack: true }, ctx);
    expect(repo.updateLook).not.toHaveBeenCalled();
    expect(r.theme).toBe("paper");
  });

  it("đồng bộ giữa thiết bị: tài khoản là gốc, cookie lệch thì trả theme của tài khoản", async () => {
    owned = [row("forest")];
    repo.getProfile.mockResolvedValue(profile({ theme: "forest" }));
    const r = await pollCosmetics(ME, { ack: false, cookieTheme: "dark" }, ctx);
    expect(r.theme).toBe("forest");
    expect(repo.updateLook).not.toHaveBeenCalled();
  });

  it("cookie giả mạo (theme chưa mở) bị bỏ qua khi hồ sơ chưa có theme", async () => {
    const r = await pollCosmetics(ME, { ack: false, cookieTheme: "twilight" }, ctx);
    expect(r.theme).toBe("paper");
    expect(repo.updateLook).toHaveBeenCalledWith(ME, { theme: "paper" });
  });

  it("'auto' được giữ và đồng bộ", async () => {
    repo.getProfile.mockResolvedValue(profile({ theme: "auto" }));
    expect((await pollCosmetics(ME, { ack: false, cookieTheme: "paper" }, ctx)).theme).toBe("auto");
  });

  it("vượt giới hạn tần suất: không làm gì", async () => {
    rate.hitRateLimit.mockResolvedValue(false);
    expect(await pollCosmetics(ME, { ack: true }, ctx)).toEqual({ messages: [], theme: null, changed: false });
    expect(repo.syncLevelCosmetics).not.toHaveBeenCalled();
  });

  it("lỗi đồng bộ level không làm hỏng việc nền", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    repo.syncLevelCosmetics.mockRejectedValue(new Error("db down"));
    await expect(pollCosmetics(ME, { ack: true }, ctx)).resolves.toMatchObject({ theme: "paper" });
  });
});

describe("hiển thị cho người khác và menu nhanh", () => {
  it("bảng xếp hạng chỉ hiện avatar/khung còn hạn của chủ nhân; avatar emoji cũ giữ nguyên", async () => {
    const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    repo.listOwnedForUsers.mockResolvedValue(new Map([[A, []], [B, []]]));
    const m = await publicLooks([{ id: A, avatar: "fox", frame: "da-het-han" }, { id: B, avatar: null, frame: null }], ctx);
    expect(m.get(A)).toEqual({ avatar: "fox", frame: null });
    expect(m.get(B)).toEqual({ avatar: null, frame: null });
  });

  it("menu nhanh chỉ liệt kê theme dùng được: mặc định + đã có còn hạn", () => {
    expect(usableThemeOptions([], ctx).map((t) => t.id).sort()).toEqual(["dark", "paper"]);
    const ids = usableThemeOptions([row("forest"), row("candy", { expiresAt: iso(-1) })], ctx).map((t) => t.id).sort();
    expect(ids).toEqual(["dark", "forest", "paper"]);
  });
});
