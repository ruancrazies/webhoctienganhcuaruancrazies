import { describe, expect, it } from "vitest";
import {
  ackOf,
  daysLeft,
  isUsable,
  itemState,
  mergeCatalog,
  pendingNotices,
  resolveLook,
  type CatalogItem,
  type DbCatalogRow,
  type LookCatalog,
  type ManifestEntry,
  type OwnedRow,
} from "../../src/core/cosmetics";
import { xpToReach } from "../../src/core/xpLevel";
import { acquireText, expiryText, fmtDayMonth, noticeMessages, stateText } from "../../src/lib/cosmeticText";

const NOW = new Date("2026-11-08T03:00:00Z"); // 10:00 giờ VN
const iso = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * 86_400_000).toISOString();

const item = (o: Partial<CatalogItem> & Pick<CatalogItem, "id" | "unlock">): CatalogItem => ({
  kind: "theme", name: o.id, rarity: null, durationDays: null, active: true, availableFrom: null, availableUntil: null, synced: true, ...o,
});
const row = (cosmeticId: string, o: Partial<OwnedRow> = {}): OwnedRow => ({
  cosmeticId, source: "level", grantedAt: iso(-30), expiresAt: null, seenAt: iso(-29), warned: 0, ...o,
});

const forest = item({ id: "forest", unlock: { type: "level", level: 10 } });
const state = (it: CatalogItem, xp: number, owned?: OwnedRow) => itemState(it, { now: NOW, xp, owned });

describe("itemState", () => {
  it("món default luôn mở; ngừng cung cấp thì đóng", () => {
    expect(state(item({ id: "paper", unlock: { type: "default" } }), 0)).toMatchObject({ status: "owned", permanent: true });
    expect(state(item({ id: "paper", unlock: { type: "default" }, active: false }), 0)).toEqual({ status: "closed" });
  });

  it("khóa theo level: ghi rõ thiếu bao nhiêu XP và tỉ lệ tiến độ", () => {
    const need = xpToReach(10);
    const s = state(forest, need - 340);
    expect(s).toMatchObject({ status: "locked", acquire: { type: "level", level: 10, xpLeft: 340, reached: false } });
    if (s.status !== "locked" || s.acquire.type !== "level") throw new Error("phải là khóa theo level");
    expect(s.acquire.ratio).toBeCloseTo((need - 340) / need, 5);
    if (s.status !== "locked") throw new Error("phải bị khóa");
    expect(acquireText(s.acquire)).toBe("Cần Level 10 — còn 340 XP");
  });

  it("đủ level mà chưa có dòng (chưa đồng bộ) → báo đang mở khóa, không báo thiếu XP", () => {
    const s = state(forest, xpToReach(10) + 5);
    expect(s).toMatchObject({ status: "locked", acquire: { reached: true } });
    expect(stateText(s)).toMatch(/đang mở khóa/);
  });

  it("đã có và còn hạn; vĩnh viễn thì không có nhãn hạn", () => {
    expect(state(forest, 0, row("forest"))).toMatchObject({ status: "owned", permanent: true, daysLeft: null });
    const s = state(forest, 0, row("forest", { expiresAt: iso(2.2) }));
    expect(s).toMatchObject({ status: "owned", permanent: false, daysLeft: 3 });
    expect(expiryText(s)).toBe("Còn 3 ngày");
  });

  it("còn dưới 1 ngày vẫn ghi 'Còn 1 ngày' (không bao giờ 0)", () => {
    expect(daysLeft(iso(0.01), NOW)).toBe(1);
    expect(daysLeft(iso(-0.01), NOW)).toBeNull();
    expect(daysLeft(null, NOW)).toBeNull();
  });

  it("hết hạn đúng lúc expires_at (<= now) và ghi ngày theo giờ VN", () => {
    const s = state(forest, 0, row("forest", { expiresAt: NOW.toISOString() }));
    expect(s).toMatchObject({ status: "expired" });
    expect(isUsable(s)).toBe(false);
    expect(expiryText(s)).toBe("Hết hạn 08/11");
  });

  it("ngày hết hạn tính theo giờ VN, không theo UTC (17:30 UTC ngày 7 = 00:30 ngày 8 VN)", () => {
    expect(fmtDayMonth("2026-11-07T17:30:00Z")).toBe("08/11");
    expect(fmtDayMonth("2026-12-31T16:59:00Z")).toBe("31/12");
    expect(fmtDayMonth("2026-12-31T17:00:00Z")).toBe("01/01");
  });

  it("hết hạn: còn cách nhận lại nếu món còn bán; hết cửa nhận thì không", () => {
    const ev = item({ id: "santa", kind: "frame", unlock: { type: "event", event: "xmas" } });
    const r = row("santa", { source: "event", expiresAt: iso(-1) });
    expect(state(ev, 0, r)).toMatchObject({ status: "expired", acquire: { type: "event" } });
    expect(state({ ...ev, availableUntil: iso(-0.5) }, 0, r)).toMatchObject({ status: "expired", acquire: null });
    expect(state({ ...ev, active: false }, 0, r)).toMatchObject({ status: "expired", acquire: null });
  });

  it("ngừng cung cấp: người đang có vẫn dùng được, người khác không thấy", () => {
    const off = { ...forest, active: false };
    expect(state(off, 0, row("forest")).status).toBe("owned");
    expect(state(off, 0).status).toBe("closed");
  });

  it("cửa nhận: chưa mở = khóa kèm ngày mở; đã đóng = closed", () => {
    const ev = item({ id: "santa", kind: "frame", unlock: { type: "event", event: "xmas" } });
    expect(state({ ...ev, availableFrom: iso(5) }, 0)).toMatchObject({ status: "locked", opensAt: iso(5) });
    expect(state({ ...ev, availableUntil: iso(-1) }, 0)).toEqual({ status: "closed" });
  });

  it("'Mới' khi chưa được báo hoặc vừa nhận dưới 3 ngày", () => {
    const isNew = (o: Partial<OwnedRow>) => {
      const s = state(forest, 0, row("forest", o));
      return s.status === "owned" && s.isNew;
    };
    expect(isNew({ seenAt: null })).toBe(true);
    expect(isNew({ grantedAt: iso(-1), seenAt: iso(-1) })).toBe(true);
    expect(isNew({})).toBe(false);
  });

  it("mô tả bằng chữ cho các trạng thái còn lại", () => {
    expect(stateText(state(forest, 0, row("forest")))).toBe("Đã có · vĩnh viễn");
    expect(stateText({ status: "closed" })).toBe("Đã ngừng cung cấp");
    expect(acquireText({ type: "grant" })).toMatch(/quà tặng/);
  });
});

describe("mergeCatalog", () => {
  const m: ManifestEntry[] = [
    { id: "paper", kind: "theme", name: "Vở ô ly", rarity: null, unlock: { type: "default" }, durationDays: null, active: true },
    { id: "forest", kind: "theme", name: "Rừng đêm", rarity: null, unlock: { type: "level", level: 10 }, durationDays: null, active: true },
  ];
  const db: DbCatalogRow[] = [
    { id: "forest", kind: "theme", unlock: { type: "level", level: 20 }, durationDays: 30, availableFrom: null, availableUntil: iso(9), active: false },
    { id: "da-xoa", kind: "theme", unlock: { type: "default" }, durationDays: null, availableFrom: null, availableUntil: null, active: true },
  ];
  it("tên lấy từ code; luật, hạn, cửa nhận, bật/tắt lấy từ DB; món chưa đồng bộ dùng manifest; dòng DB mồ côi bị bỏ", () => {
    const out = mergeCatalog(m, db);
    expect(out.map((x) => x.id)).toEqual(["paper", "forest"]);
    expect(out[0]).toMatchObject({ synced: false, unlock: { type: "default" } });
    expect(out[1]).toMatchObject({ name: "Rừng đêm", synced: true, unlock: { type: "level", level: 20 }, durationDays: 30, active: false, availableUntil: iso(9) });
  });
  it("khác loại giữa DB và code → coi như chưa đồng bộ (không tin dòng DB)", () => {
    expect(mergeCatalog(m, [{ ...db[0]!, kind: "avatar" }])[1]!.synced).toBe(false);
  });
});

describe("resolveLook", () => {
  const catalog: LookCatalog = new Map([
    ["paper", { kind: "theme", unlock: { type: "default" }, active: true }],
    ["dark", { kind: "theme", unlock: { type: "default" }, active: true }],
    ["forest", { kind: "theme", unlock: { type: "level", level: 10 }, active: true }],
    ["mochi", { kind: "avatar", unlock: { type: "event", event: "tet" }, active: true }],
    ["santa", { kind: "frame", unlock: { type: "event", event: "xmas" }, active: true }],
  ]);
  const look = (eq: { theme?: string | null; avatar?: string | null; frame?: string | null }, owned: OwnedRow[] = []) =>
    resolveLook({ theme: null, avatar: null, frame: null, ...eq }, { now: NOW, catalog, owned, legacyAvatar: (id) => id === "fox" });

  it("không chọn gì → Vở ô ly, không avatar/khung", () => {
    expect(look({})).toEqual({ look: { theme: "paper", auto: false, avatar: null, frame: null }, reverted: [] });
  });
  it("theme default dùng được không cần dòng sở hữu; 'auto' bật tự động", () => {
    expect(look({ theme: "dark" }).look.theme).toBe("dark");
    expect(look({ theme: "auto" }).look).toMatchObject({ auto: true, theme: "paper" });
  });
  it("món có sở hữu còn hạn → giữ; không sở hữu → về mặc định và báo", () => {
    expect(look({ theme: "forest" }, [row("forest")]).look.theme).toBe("forest");
    const r = look({ theme: "forest", frame: "santa" });
    expect(r.look).toMatchObject({ theme: "paper", frame: null });
    expect(r.reverted).toEqual([{ kind: "theme", id: "forest" }, { kind: "frame", id: "santa" }]);
  });
  it("món hết hạn → về mặc định; người khác chỉ thấy món còn hạn", () => {
    const r = look({ avatar: "mochi", frame: "santa" }, [row("mochi", { expiresAt: iso(-1) }), row("santa", { expiresAt: iso(5) })]);
    expect(r.look).toMatchObject({ avatar: null, frame: "santa" });
    expect(r.reverted).toEqual([{ kind: "avatar", id: "mochi" }]);
  });
  it("sai loại (đặt mã avatar vào ô theme/khung) bị từ chối", () => {
    expect(look({ theme: "mochi" }, [row("mochi")]).look.theme).toBe("paper");
    expect(look({ frame: "forest" }, [row("forest")]).look.frame).toBeNull();
  });
  it("avatar emoji cũ giữ nguyên; mã lạ (đã xóa khỏi code) về mặc định mà không báo", () => {
    expect(look({ avatar: "fox" }).look.avatar).toBe("fox");
    expect(look({ avatar: "xoa-roi" })).toMatchObject({ look: { avatar: null }, reverted: [] });
    expect(look({ theme: "khong-co" }).look.theme).toBe("paper");
  });
});

describe("thông báo", () => {
  const known = () => true;
  it("mở khóa: một lần (seen_at null), không báo lại khi đã seen", () => {
    expect(pendingNotices([row("forest", { seenAt: null })], NOW, known)).toEqual([{ kind: "unlock", id: "forest" }]);
    expect(pendingNotices([row("forest")], NOW, known)).toEqual([]);
  });
  it("nhắc hạn ở mốc 7 ngày rồi 1 ngày, mỗi mốc một lần", () => {
    const at = (days: number, warned: number) => pendingNotices([row("santa", { expiresAt: iso(days), warned })], NOW, known);
    expect(at(10, 0)).toEqual([]);
    expect(at(6.5, 0)).toEqual([{ kind: "soon", id: "santa", stage: 1, daysLeft: 7 }]);
    expect(at(6.5, 1)).toEqual([]);
    expect(at(0.5, 1)).toEqual([{ kind: "soon", id: "santa", stage: 2, daysLeft: 1 }]);
    expect(at(0.5, 2)).toEqual([]);
  });
  it("vắng mặt qua cả hai mốc thì chỉ nhận mốc gần nhất (không dồn hai câu)", () => {
    expect(pendingNotices([row("santa", { expiresAt: iso(0.4), warned: 0 })], NOW, known)).toHaveLength(1);
  });
  it("đã hết hạn: báo đúng một lần", () => {
    expect(pendingNotices([row("santa", { expiresAt: iso(-1), warned: 2 })], NOW, known)).toEqual([{ kind: "expired", id: "santa" }]);
    expect(pendingNotices([row("santa", { expiresAt: iso(-1), warned: 3 })], NOW, known)).toEqual([]);
  });
  it("bỏ qua món không còn trong code", () => {
    expect(pendingNotices([row("da-xoa", { seenAt: null })], NOW, (id) => id !== "da-xoa")).toEqual([]);
  });
  it("nhận lại món hết hạn (seen_at, warned được đặt lại) thì báo lại", () => {
    const regained = row("santa", { seenAt: null, warned: 0, expiresAt: iso(30), grantedAt: iso(0) });
    expect(pendingNotices([regained], NOW, known)).toEqual([{ kind: "unlock", id: "santa" }]);
  });
  it("ackOf: seen cho mở khóa, mốc cao nhất cho nhắc hạn", () => {
    expect(ackOf([{ kind: "unlock", id: "a" }, { kind: "soon", id: "b", stage: 1, daysLeft: 5 }, { kind: "soon", id: "b", stage: 2, daysLeft: 1 }, { kind: "expired", id: "c" }])).toEqual({
      seen: ["a"],
      warned: [{ id: "b", stage: 2 }, { id: "c", stage: 3 }],
    });
  });
});

describe("noticeMessages", () => {
  const name = (id: string) => ({ forest: "Rừng đêm", candy: "Kẹo ngọt", owl: "Cú vàng", star: "Sao", santa: "Nón Noel" })[id] ?? id;
  it("một món: câu riêng; nhiều món: gộp một câu", () => {
    expect(noticeMessages([{ kind: "unlock", id: "forest" }], name)[0]!.text).toBe("Bạn vừa mở khóa “Rừng đêm”! Vào Bộ sưu tập để dùng nhé.");
    const many = noticeMessages([{ kind: "unlock", id: "forest" }, { kind: "unlock", id: "candy" }, { kind: "unlock", id: "owl" }, { kind: "unlock", id: "star" }], name);
    expect(many).toHaveLength(1);
    expect(many[0]!.text).toContain("4 món mới");
    expect(many[0]!.text).toContain("và 1 món khác");
  });
  it("mỗi loại thông báo một câu, id ổn định để chống lặp", () => {
    const msgs = noticeMessages([{ kind: "soon", id: "santa", stage: 2, daysLeft: 1 }, { kind: "expired", id: "star" }], name);
    expect(msgs.map((m) => m.text)).toEqual(["“Nón Noel” còn dưới 1 ngày là hết hạn.", "“Sao” đã hết hạn nên mình đưa về mặc định. Món vẫn nằm trong Bộ sưu tập."]);
    expect(new Set(msgs.map((m) => m.id)).size).toBe(2);
    expect(noticeMessages([], name)).toEqual([]);
  });
});
