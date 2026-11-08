import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { freshDb } from "./helpers";

let pg: PGlite;
const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const U3 = "33333333-3333-3333-3333-333333333333";

const cat = (id: string, kind: string, unlock: object) =>
  pg.query(`insert into cosmetics (id, kind, name, unlock) values ($1, $2, $1, $3::jsonb)`, [id, kind, JSON.stringify(unlock)]);

beforeAll(async () => {
  ({ pg } = await freshDb());
  await pg.exec(`insert into auth.users (id, email, raw_user_meta_data) values
    ('${U1}', 'a@x.vn', '{"username":"Alice_01"}'), ('${U2}', 'b@x.vn', '{"username":"Bob_02"}'),
    ('${U3}', 'c@x.vn', '{"username":"Carol_03"}')`);
  await pg.exec(`alter role service_role bypassrls`);
}, 60000);
afterAll(() => pg.close());

beforeEach(async () => {
  await pg.exec(`delete from user_cosmetics; delete from cosmetics;`);
});

const rows = async (u = U1) =>
  (await pg.query<{ cosmetic_id: string; source: string; expires_at: string | null; seen_at: string | null; warned: number }>(
    `select cosmetic_id, source, expires_at, seen_at, warned from user_cosmetics where user_id = $1 order by cosmetic_id`,
    [u],
  )).rows;

describe("schema (0019)", () => {
  it("profiles có theme và frame, mặc định null", async () => {
    const r = await pg.query<{ theme: string | null; frame: string | null }>(`select theme, frame from profiles where id = $1`, [U1]);
    expect(r.rows[0]).toEqual({ theme: null, frame: null });
  });

  it("danh mục từ chối dữ liệu sai: id, loại, luật mở khóa, cửa nhận", async () => {
    await expect(cat("Bad_Id", "theme", { type: "default" })).rejects.toThrow();
    await expect(cat("ok-1", "sticker", { type: "default" })).rejects.toThrow();
    await expect(cat("ok-2", "theme", { type: "magic" })).rejects.toThrow();
    await expect(cat("ok-3", "theme", { type: "level" })).rejects.toThrow(); // thiếu level
    await expect(cat("ok-4", "theme", { type: "level", level: "abc" })).rejects.toThrow();
    await expect(cat("ok-5", "theme", { type: "event" })).rejects.toThrow(); // thiếu mã sự kiện
    await expect(pg.query(`insert into cosmetics (id, kind, name, available_from, available_until) values ('ok-6','theme','x', now(), now() - interval '1 day')`)).rejects.toThrow();
    await cat("ok-7", "theme", { type: "level", level: 10 }); // hợp lệ
  });

  it("authenticated KHÔNG đọc/ghi được hai bảng mới (RLS + thu quyền)", async () => {
    await cat("forest", "theme", { type: "level", level: 10 });
    await pg.exec(`set role authenticated`);
    try {
      await expect(pg.query(`select * from cosmetics`)).rejects.toThrow(/permission denied/);
      await expect(pg.query(`select * from user_cosmetics`)).rejects.toThrow(/permission denied/);
      await expect(pg.query(`select grant_cosmetic($1, 'forest', 'grant')`, [U1])).rejects.toThrow(/permission denied/);
      await expect(pg.query(`select sync_level_cosmetics($1, 50)`, [U1])).rejects.toThrow(/permission denied/);
      await expect(pg.query(`update profiles set theme = 'forest' where id = $1`, [U1])).rejects.toThrow(/permission denied/);
    } finally {
      await pg.exec(`reset role`);
    }
  });

  it("xóa người dùng thì xóa món đã có; món đã có chặn xóa khỏi danh mục", async () => {
    await cat("candy", "theme", { type: "grant" });
    await pg.query(`select grant_cosmetic($1, 'candy', 'grant')`, [U3]);
    await expect(pg.query(`delete from cosmetics where id = 'candy'`)).rejects.toThrow(); // ngừng cung cấp = active=false, không xóa
    await pg.query(`delete from profiles where id = $1`, [U3]);
    expect(await rows(U3)).toEqual([]);
  });
});

describe("sync_level_cosmetics", () => {
  beforeEach(async () => {
    await cat("paper", "theme", { type: "default" });
    await cat("forest", "theme", { type: "level", level: 10 });
    await cat("candy", "theme", { type: "level", level: 15 });
    await cat("owl", "avatar", { type: "level", level: 25 });
    await cat("santa", "frame", { type: "event", event: "xmas" });
  });
  const sync = async (u: string, level: number) => (await pg.query<{ s: string[] }>(`select sync_level_cosmetics($1, $2) as s`, [u, level])).rows[0]!.s;

  it("cấp đúng các món `level` đủ điều kiện, bỏ qua default / event / grant", async () => {
    expect(await sync(U1, 9)).toEqual([]);
    expect(await sync(U1, 12)).toEqual(["forest"]);
    expect(await sync(U1, 25)).toEqual(["candy", "owl"]);
    const r = await rows();
    expect(r.map((x) => x.cosmetic_id)).toEqual(["candy", "forest", "owl"]);
    expect(r.every((x) => x.source === "level" && x.expires_at === null && x.seen_at === null && x.warned === 0)).toBe(true);
  });

  it("idempotent: chạy lại không cấp thêm, không đụng seen_at đã ghi", async () => {
    await sync(U1, 15);
    await pg.query(`update user_cosmetics set seen_at = now() where user_id = $1`, [U1]);
    expect(await sync(U1, 15)).toEqual([]);
    expect((await rows()).every((x) => x.seen_at !== null)).toBe(true);
  });

  it("KHÔNG thu hồi: level thấp hơn (đổi công thức XP) vẫn giữ món đã mở", async () => {
    await sync(U1, 25);
    expect(await sync(U1, 3)).toEqual([]);
    expect((await rows()).map((x) => x.cosmetic_id)).toEqual(["candy", "forest", "owl"]);
  });

  it("món ngừng cung cấp hoặc ngoài cửa nhận thì không cấp mới", async () => {
    await pg.exec(`update cosmetics set active = false where id = 'candy'`);
    await pg.exec(`update cosmetics set available_until = now() - interval '1 hour' where id = 'owl'`);
    expect(await sync(U1, 50)).toEqual(["forest"]);
    await pg.exec(`update cosmetics set available_from = now() + interval '1 day' where id = 'forest'`);
    expect(await sync(U2, 50)).toEqual([]);
  });

  it("theo từng người dùng", async () => {
    await sync(U1, 30);
    expect(await sync(U2, 10)).toEqual(["forest"]);
    expect((await rows(U2)).map((x) => x.cosmetic_id)).toEqual(["forest"]);
  });
});

describe("grant_cosmetic", () => {
  const grant = async (u: string, id: string, src: string) => (await pg.query<{ g: boolean }>(`select grant_cosmetic($1, $2, $3) as g`, [u, id, src])).rows[0]!.g;

  it("món có hạn: expires_at = lúc nhận + duration_days; món không hạn: vĩnh viễn", async () => {
    await pg.exec(`insert into cosmetics (id, kind, name, rarity, unlock, duration_days) values
      ('santa','frame','Nón Noel','rare','{"type":"event","event":"xmas"}', 30),
      ('star','frame','Sao','epic','{"type":"event","event":"xmas"}', null)`);
    expect(await grant(U1, "santa", "event")).toBe(true);
    expect(await grant(U1, "star", "event")).toBe(true);
    const days = (await pg.query<{ d: number | null }>(
      `select round(extract(epoch from (expires_at - granted_at)) / 86400)::int as d from user_cosmetics where user_id = $1 and cosmetic_id = 'santa'`,
      [U1],
    )).rows[0]!.d;
    expect(days).toBe(30);
    expect((await rows()).find((r) => r.cosmetic_id === "star")!.expires_at).toBeNull();
  });

  it("còn hạn thì nhận lại KHÔNG gia hạn / cộng dồn", async () => {
    await pg.exec(`insert into cosmetics (id, kind, name, unlock, duration_days) values ('santa','frame','x','{"type":"event","event":"e"}', 30)`);
    expect(await grant(U1, "santa", "event")).toBe(true);
    await pg.query(`update user_cosmetics set expires_at = now() + interval '2 days', seen_at = now(), warned = 1 where user_id = $1`, [U1]);
    const before = (await rows())[0]!;
    expect(await grant(U1, "santa", "event")).toBe(false);
    expect(await rows()).toEqual([before]);
  });

  it("đã hết hạn thì nhận lại: tính lại từ bây giờ, báo lại mở khóa, không cộng dồn", async () => {
    await pg.exec(`insert into cosmetics (id, kind, name, unlock, duration_days) values ('santa','frame','x','{"type":"event","event":"e"}', 30)`);
    await grant(U1, "santa", "event");
    await pg.query(`update user_cosmetics set granted_at = now() - interval '40 days', expires_at = now() - interval '10 days', seen_at = now() - interval '39 days', warned = 3 where user_id = $1`, [U1]);
    expect(await grant(U1, "santa", "event")).toBe(true);
    const r = (await rows())[0]!;
    expect(r.seen_at).toBeNull();
    expect(r.warned).toBe(0);
    const left = (await pg.query<{ d: number }>(`select round(extract(epoch from (expires_at - now())) / 86400)::int as d from user_cosmetics where user_id = $1`, [U1])).rows[0]!.d;
    expect(left).toBe(30);
  });

  it("món vĩnh viễn đã có thì không bị món có hạn ghi đè", async () => {
    await pg.exec(`insert into cosmetics (id, kind, name, unlock, duration_days) values ('santa','frame','x','{"type":"event","event":"e"}', 30)`);
    await pg.query(`insert into user_cosmetics (user_id, cosmetic_id, source) values ($1,'santa','level')`, [U1]);
    expect(await grant(U1, "santa", "event")).toBe(false);
    expect((await rows())[0]).toMatchObject({ source: "level", expires_at: null });
  });

  it("cấp theo level luôn vĩnh viễn kể cả khi món có duration_days", async () => {
    await pg.exec(`insert into cosmetics (id, kind, name, unlock, duration_days) values ('forest','theme','x','{"type":"level","level":10}', 30)`);
    await grant(U1, "forest", "level");
    expect((await rows())[0]!.expires_at).toBeNull();
  });

  it("cửa nhận và ngừng cung cấp: chặn event/level, nhưng admin tặng (grant) vẫn được", async () => {
    await pg.exec(`insert into cosmetics (id, kind, name, unlock, available_until) values ('old','frame','x','{"type":"event","event":"e"}', now() - interval '1 day')`);
    await expect(grant(U1, "old", "event")).rejects.toThrow(/cosmetic_unavailable/);
    expect(await grant(U1, "old", "grant")).toBe(true);
    await pg.exec(`insert into cosmetics (id, kind, name, unlock, active) values ('off','frame','x','{"type":"grant"}', false)`);
    await expect(grant(U1, "off", "event")).rejects.toThrow(/cosmetic_unavailable/);
    expect(await grant(U1, "off", "grant")).toBe(true);
  });

  it("báo lỗi có mã khi món không tồn tại hoặc nguồn sai", async () => {
    await expect(grant(U1, "khong-co", "grant")).rejects.toThrow(/cosmetic_not_found/);
    await pg.exec(`insert into cosmetics (id, kind, name) values ('paper','theme','x')`);
    await expect(grant(U1, "paper", "default")).rejects.toThrow(/cosmetic_bad_source/);
  });
});
