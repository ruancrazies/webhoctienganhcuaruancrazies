import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ManifestEntry } from "../../src/core/cosmetics";
import { manifestEntries } from "../../src/cosmetics/registry";
import type { Db } from "../../scripts/content/lib/db";
import { syncCatalog } from "../../scripts/cosmetics/sync-lib";
import { freshDb } from "./helpers";

let pg: PGlite;
let db: Db;
beforeAll(async () => {
  ({ pg, db } = await freshDb());
}, 60000);
afterAll(() => pg.close());

const row = async (id: string) => (await pg.query<Record<string, unknown>>(`select * from cosmetics where id = $1`, [id])).rows[0];
const count = async () => (await pg.query<{ n: number }>(`select count(*)::int n from cosmetics`)).rows[0]!.n;

describe("cosmetics:sync", () => {
  it("dry-run không ghi gì; chạy thật thêm đủ mọi món trong code với mặc định từ manifest", async () => {
    const all = manifestEntries();
    const dry = await syncCatalog(db, all, { dryRun: true });
    expect(dry.inserted).toHaveLength(all.length);
    expect(await count()).toBe(0);

    await syncCatalog(db, all);
    expect(await count()).toBe(all.length);
    expect(await row("forest")).toMatchObject({ kind: "theme", unlock: { type: "level", level: 10 }, active: true, duration_days: null });
    expect(await row("paper")).toMatchObject({ unlock: { type: "default" } });
  });

  it("chạy lại: không thêm, không đổi gì", async () => {
    const r = await syncCatalog(db, manifestEntries());
    expect(r).toEqual({ inserted: [], updated: [], orphans: [] });
  });

  it("KHÔNG ghi đè phần admin chỉnh (luật mở khóa, hạn, cửa nhận, bật/tắt) nhưng cập nhật tên", async () => {
    await pg.exec(`update cosmetics set unlock = '{"type":"level","level":30}', duration_days = 60, active = false, available_until = now() + interval '9 days' where id = 'forest'`);
    const changed = manifestEntries().map((m) => (m.id === "forest" ? { ...m, name: "Rừng đêm (mới)" } : m));
    const r = await syncCatalog(db, changed);
    expect(r.updated.map((u) => u.id)).toEqual(["forest"]);
    expect(await row("forest")).toMatchObject({ name: "Rừng đêm (mới)", unlock: { type: "level", level: 30 }, duration_days: 60, active: false });
    expect((await row("forest"))!.available_until).not.toBeNull();
  });

  it("món mới thêm sau vẫn lấy mặc định từ manifest (kể cả có hạn và độ hiếm)", async () => {
    const extra: ManifestEntry = { id: "santa", kind: "frame", name: "Nón Noel", rarity: "rare", unlock: { type: "event", event: "giang-sinh" }, durationDays: 30, active: true };
    const r = await syncCatalog(db, [...manifestEntries(), extra]);
    expect(r.inserted).toEqual(["santa"]);
    expect(await row("santa")).toMatchObject({ kind: "frame", rarity: "rare", duration_days: 30, unlock: { type: "event", event: "giang-sinh" } });
  });

  it("món bị xóa khỏi code: báo mồ côi, giữ nguyên dòng DB", async () => {
    const r = await syncCatalog(db, manifestEntries()); // 'santa' không còn trong manifest
    expect(r.orphans).toEqual(["santa"]);
    expect(await row("santa")).toBeTruthy();
  });

  it("đổi loại của một id là lỗi và không ghi gì (một giao dịch)", async () => {
    const bad = manifestEntries().map((m) => (m.id === "candy" ? { ...m, kind: "avatar" as const } : m.id === "forest" ? { ...m, name: "Khác" } : m));
    await expect(syncCatalog(db, bad)).rejects.toThrow(/đổi loại/);
    expect((await row("forest"))!.name).toBe("Rừng đêm"); // không phải "Khác": giao dịch đã hoàn tác
  });
});
