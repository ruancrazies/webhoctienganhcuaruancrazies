import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ALL_QUESTS } from "../../src/core/quests";
import { freshDb } from "./helpers";

let pg: PGlite;
const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const U3 = "33333333-3333-3333-3333-333333333333";
const DAY = 20_000;

const one = async <T extends object>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows[0];
const defs = JSON.stringify(ALL_QUESTS.map((q) => ({ quest: q.id, target: q.target, reward: q.reward })));
const bump = (user: string, day: number, learn = 0, review = 0, play = 0, test = 0) =>
  pg.query(`select bump_quests($1, $2, $3::jsonb, $4, $5, $6, $7)`, [user, day, defs, learn, review, play, test]);
const claim = async (user: string, day: number, quest: string) =>
  (await one<{ r: { reward: number; xp: number } }>(`select claim_quest($1, $2, $3) as r`, [user, day, quest])).r;
const rowOf = async (user: string, day: number, quest: string) =>
  one<{ progress: number; target: number; reward: number; claimed_at: string | null }>(
    `select progress, target, reward, claimed_at from daily_quests where user_id = $1 and day = $2 and quest = $3`,
    [user, day, quest],
  );
const xpOf = async (user: string) => one<{ xp: string; xp_today: number }>(`select xp::text, xp_today from profiles where id = $1`, [user]);

beforeAll(async () => {
  ({ pg } = await freshDb());
  await pg.exec(`insert into auth.users (id, email, raw_user_meta_data) values
    ('${U1}', 'a@x.vn', '{"username":"Alice_01"}'), ('${U2}', 'b@x.vn', '{"username":"Bob_02"}'),
    ('${U3}', 'c@x.vn', '{"username":"Cara_03"}')`);
}, 60000);
afterAll(() => pg.close());

describe("bump_quests", () => {
  it("tạo đủ 5 dòng của ngày với mục tiêu/thưởng chốt từ định nghĩa", async () => {
    await bump(U1, DAY, 5, 0, 0);
    const rows = (await pg.query<{ quest: string; target: number; reward: number }>(
      `select quest, target, reward from daily_quests where user_id = $1 and day = $2 order by quest`, [U1, DAY])).rows;
    expect(rows).toEqual([
      { quest: "all", target: 4, reward: 300 },
      { quest: "learn", target: 20, reward: 60 },
      { quest: "play", target: 1, reward: 80 },
      { quest: "review", target: 20, reward: 60 },
      { quest: "test", target: 1, reward: 150 },
    ]);
    expect((await rowOf(U1, DAY, "learn"))!.progress).toBe(5);
  });

  it("cộng dồn qua nhiều lần gọi và chặn ở mục tiêu", async () => {
    await bump(U1, DAY, 10, 0, 0);
    expect((await rowOf(U1, DAY, "learn"))!.progress).toBe(15);
    await bump(U1, DAY, 100, 0, 0);
    expect((await rowOf(U1, DAY, "learn"))!.progress).toBe(20);
  });

  it("số âm / null không làm giảm tiến độ", async () => {
    await pg.query(`select bump_quests($1, $2, $3::jsonb, -5, null, 0, 0)`, [U1, DAY, defs]);
    expect((await rowOf(U1, DAY, "learn"))!.progress).toBe(20);
    expect((await rowOf(U1, DAY, "review"))!.progress).toBe(0);
  });

  it("'all' đếm số nhiệm vụ cơ bản đã đủ", async () => {
    expect((await rowOf(U1, DAY, "all"))!.progress).toBe(1); // mới xong learn
    await bump(U1, DAY, 0, 20, 0);
    expect((await rowOf(U1, DAY, "all"))!.progress).toBe(2);
    await bump(U1, DAY, 0, 0, 1);
    expect((await rowOf(U1, DAY, "all"))!.progress).toBe(3);
    await bump(U1, DAY, 0, 0, 0, 1);
    expect((await rowOf(U1, DAY, "test"))!.progress).toBe(1);
    expect((await rowOf(U1, DAY, "all"))!.progress).toBe(4);
  });

  it("mỗi người, mỗi ngày độc lập", async () => {
    await bump(U2, DAY, 0, 0, 1);
    expect((await rowOf(U2, DAY, "play"))!.progress).toBe(1);
    expect((await rowOf(U2, DAY, "learn"))!.progress).toBe(0);
    await bump(U2, DAY + 1, 3, 0, 0);
    expect((await rowOf(U2, DAY + 1, "learn"))!.progress).toBe(3);
    expect((await rowOf(U2, DAY, "learn"))!.progress).toBe(0);
  });

  it("dọn dòng cũ hơn 7 ngày của người đó (người khác không bị đụng), giữ đúng 7 ngày gần nhất", async () => {
    const D = 30_000;
    await bump(U3, D - 8, 1, 0, 0);
    await bump(U3, D - 7, 1, 0, 0);
    await bump(U3, D, 1, 0, 0); // dọn mọi ngày < D − 7
    const days = (await pg.query<{ day: number }>(`select distinct day from daily_quests where user_id = $1 order by day`, [U3])).rows.map((r) => r.day);
    expect(days).toEqual([D - 7, D]);
    // dữ liệu của U1 (ngày DAY, cũ hơn rất nhiều) vẫn còn
    expect((await rowOf(U1, DAY, "learn"))!.progress).toBe(20);
  });
});

describe("claim_quest", () => {
  it("chưa có dòng của ngày đó → quest_not_found", async () => {
    await expect(claim(U1, DAY + 500, "learn")).rejects.toThrow(/quest_not_found/);
  });

  it("chưa đủ tiến độ → quest_not_ready, không cộng XP", async () => {
    await bump(U2, DAY + 2, 5, 0, 0);
    const before = await xpOf(U2);
    await expect(claim(U2, DAY + 2, "learn")).rejects.toThrow(/quest_not_ready/);
    expect((await xpOf(U2)).xp).toBe(before.xp);
    expect((await rowOf(U2, DAY + 2, "learn"))!.claimed_at).toBeNull();
  });

  it("đủ tiến độ → cộng đúng thưởng vào XP, KHÔNG đụng xp_today", async () => {
    const before = await xpOf(U1);
    const r = await claim(U1, DAY, "learn");
    expect(r.reward).toBe(60);
    expect(Number(r.xp)).toBe(Number(before.xp) + 60);
    const after = await xpOf(U1);
    expect(Number(after.xp)).toBe(Number(before.xp) + 60);
    expect(after.xp_today).toBe(before.xp_today);
    expect((await rowOf(U1, DAY, "learn"))!.claimed_at).not.toBeNull();
  });

  it("không nhận được hai lần", async () => {
    const before = await xpOf(U1);
    await expect(claim(U1, DAY, "learn")).rejects.toThrow(/quest_already_claimed/);
    expect((await xpOf(U1)).xp).toBe(before.xp);
  });

  it("nhiệm vụ 'test' nhận được +150", async () => {
    const before = await xpOf(U1);
    const r = await claim(U1, DAY, "test");
    expect(r.reward).toBe(150);
    expect(Number((await xpOf(U1)).xp)).toBe(Number(before.xp) + 150);
  });

  it("'all' nhận được khi cả bốn đã đủ (không cần nhận từng cái trước) → +300", async () => {
    // U1 đã đủ learn/review/play/test; review và play chưa nhận
    const before = await xpOf(U1);
    const r = await claim(U1, DAY, "all");
    expect(r.reward).toBe(300);
    expect(Number((await xpOf(U1)).xp)).toBe(Number(before.xp) + 300);
    await expect(claim(U1, DAY, "all")).rejects.toThrow(/quest_already_claimed/);
  });

  it("'all' chưa nhận được khi mới xong ba trong bốn, dù cột progress bị sửa tay", async () => {
    await bump(U2, DAY + 3, 20, 20, 1, 0); // learn + review + play đủ, test chưa
    await pg.query(`update daily_quests set progress = 4 where user_id = $1 and day = $2 and quest = 'all'`, [U2, DAY + 3]);
    await expect(claim(U2, DAY + 3, "all")).rejects.toThrow(/quest_not_ready/);
  });

  it("nhận thưởng của ngày khác không ảnh hưởng ngày này", async () => {
    await bump(U2, DAY + 4, 0, 0, 1);
    const r = await claim(U2, DAY + 4, "play");
    expect(r.reward).toBe(80);
    expect((await rowOf(U2, DAY + 3, "play"))!.claimed_at).toBeNull();
  });
});

describe("quyền truy cập", () => {
  it("anon/authenticated không có quyền trên bảng và hàm", async () => {
    const t = await one<{ a: boolean; b: boolean }>(
      `select has_table_privilege('authenticated', 'public.daily_quests', 'select') as a,
              has_table_privilege('anon', 'public.daily_quests', 'select') as b`);
    expect(t).toEqual({ a: false, b: false });
    const f = await one<{ a: boolean; b: boolean }>(
      `select has_function_privilege('authenticated', 'public.claim_quest(uuid,int,text)', 'execute') as a,
              has_function_privilege('service_role', 'public.claim_quest(uuid,int,text)', 'execute') as b`);
    expect(f).toEqual({ a: false, b: true });
  });
});
