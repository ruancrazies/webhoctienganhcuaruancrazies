import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { freshDb } from "./helpers";

let pg: PGlite;
const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const U3 = "33333333-3333-3333-3333-333333333333"; // người dùng bị xóa trong test

/** Giờ giả cố định: 2026-12-20 10:00 giờ VN. Mọi RPC nhận p_now nên không phụ thuộc đồng hồ máy. */
const D = (s: string) => `${s}T00:00:00+07:00`;
const EV = { key: "xmas-2026", starts: D("2026-12-15"), ends: D("2026-12-27") }; // 15/12 – 26/12 (ends_at = 00:00 ngày 27)
const IN = "2026-12-20T10:00:00+07:00";
const BEFORE = "2026-12-10T10:00:00+07:00";
const GRACE = "2026-12-28T10:00:00+07:00"; // sau ends_at 1 ngày, trong 2 ngày nhận thưởng
const AFTER = "2026-12-30T10:00:00+07:00"; // quá hạn nhận

const cat = (id: string, kind: string, extra: { unlock?: object; days?: number | null; active?: boolean; until?: string | null } = {}) =>
  pg.query(`insert into cosmetics (id, kind, name, unlock, duration_days, active, available_until) values ($1, $2, $1, $3::jsonb, $4, $5, $6)`, [
    id, kind, JSON.stringify(extra.unlock ?? { type: "event", event: EV.key }), extra.days ?? null, extra.active ?? true, extra.until ?? null,
  ]);
const event = (o: Partial<{ key: string; starts: string; ends: string; claim: number; status: string }> = {}) =>
  pg.query(`insert into seasonal_events (key, name, starts_at, ends_at, claim_days, status) values ($1, $1, $2, $3, $4, $5)`, [o.key ?? EV.key, o.starts ?? EV.starts, o.ends ?? EV.ends, o.claim ?? 2, o.status ?? "draft"]);
const task = async (metric: string, target: number, o: { xp?: number; cos?: string | null; key?: string; sort?: number } = {}): Promise<number> =>
  Number((await pg.query<{ id: string }>(
    `insert into event_tasks (event_key, metric, target, reward_xp, reward_cosmetic, sort) values ($1, $2, $3, $4, $5, $6) returning id`,
    [o.key ?? EV.key, metric, target, o.xp ?? 50, o.cos ?? null, o.sort ?? 0],
  )).rows[0]!.id);
const publish = (key = EV.key) => pg.query(`update seasonal_events set status = 'published' where key = $1`, [key]);
const bump = (u: string, now: string, d: Partial<{ learn: number; review: number; play: number; test: number }>) =>
  pg.query(`select bump_event_progress($1, $2, $3, $4, $5, $6)`, [u, now, d.learn ?? 0, d.review ?? 0, d.play ?? 0, d.test ?? 0]);
const claim = async (u: string, t: number, now: string) =>
  (await pg.query<{ r: { reward_xp: number; xp: number; cosmetic: string | null; granted: boolean } }>(`select claim_event_task($1, $2, $3) as r`, [u, t, now])).rows[0]!.r;
const prog = async (u: string, t: number) =>
  (await pg.query<{ progress: number; claimed: boolean }>(`select progress, claimed_at is not null as claimed from event_progress where user_id = $1 and task_id = $2`, [u, t])).rows[0] ?? null;
const xp = async (u: string) => Number((await pg.query<{ xp: string }>(`select xp from profiles where id = $1`, [u])).rows[0]!.xp);
const owned = async (u: string, id: string) =>
  (await pg.query<{ expires_at: string | null; seen_at: string | null; source: string }>(`select expires_at, seen_at, source from user_cosmetics where user_id = $1 and cosmetic_id = $2`, [u, id])).rows[0] ?? null;

beforeAll(async () => {
  ({ pg } = await freshDb());
  await pg.exec(`insert into auth.users (id, email, raw_user_meta_data) values
    ('${U1}', 'a@x.vn', '{"username":"Alice_01"}'), ('${U2}', 'b@x.vn', '{"username":"Bob_02"}'),
    ('${U3}', 'c@x.vn', '{"username":"Carol_03"}')`);
  await pg.exec(`alter role service_role bypassrls`);
}, 60000);
afterAll(() => pg.close());

beforeEach(async () => {
  await pg.exec(`delete from event_progress; delete from user_cosmetics; update seasonal_events set status = 'draft';
                 delete from seasonal_events; delete from cosmetics; update profiles set xp = 0;`);
});

describe("schema (0020)", () => {
  it("từ chối dữ liệu sai: key, thứ tự ngày, quá 120 ngày, claim_days, trạng thái", async () => {
    await expect(event({ key: "Bad_Key" })).rejects.toThrow();
    await expect(event({ starts: D("2026-12-20"), ends: D("2026-12-10") })).rejects.toThrow();
    await expect(event({ starts: D("2026-01-01"), ends: D("2026-06-30") })).rejects.toThrow(); // > 120 ngày
    await expect(event({ claim: 15 })).rejects.toThrow();
    await expect(event({ status: "live" })).rejects.toThrow();
    await event(); // hợp lệ
  });

  it("nhiệm vụ: metric, mục tiêu, bắt buộc có thưởng, cosmetic phải có trong danh mục, 'all' tối đa một", async () => {
    await event();
    await expect(task("fly", 5)).rejects.toThrow();
    await expect(task("learn", 0)).rejects.toThrow();
    await expect(task("learn", 5, { xp: 0 })).rejects.toThrow(); // không thưởng gì
    await expect(task("learn", 5, { xp: 0, cos: "khong-co" })).rejects.toThrow(); // khóa ngoại
    await task("learn", 5);
    await task("all", 1);
    await expect(task("all", 1)).rejects.toThrow(); // chỉ một nhiệm vụ 'all'
  });

  it("authenticated KHÔNG đọc/ghi/gọi được gì (RLS + thu quyền)", async () => {
    await event();
    await pg.exec(`set role authenticated`);
    try {
      for (const t of ["seasonal_events", "event_tasks", "event_progress"]) await expect(pg.query(`select * from ${t}`)).rejects.toThrow(/permission denied/);
      await expect(pg.query(`select bump_event_progress($1, now(), 1, 0, 0, 0)`, [U1])).rejects.toThrow(/permission denied/);
      await expect(pg.query(`select claim_event_task($1, 1, now())`, [U1])).rejects.toThrow(/permission denied/);
      await expect(pg.query(`select event_duplicate('a', 'b', now(), now())`)).rejects.toThrow(/permission denied/);
    } finally {
      await pg.exec(`reset role`);
    }
  });

  it("xóa người dùng thì xóa tiến độ của họ", async () => {
    await event();
    const t = await task("learn", 5);
    await publish();
    await bump(U3, IN, { learn: 2 });
    expect(await prog(U3, t)).toMatchObject({ progress: 2 });
    await pg.query(`delete from profiles where id = $1`, [U3]);
    expect(await prog(U3, t)).toBeNull();
  });
});

describe("bảo vệ bất biến", () => {
  it("đã xuất bản thì không thêm/sửa/xóa nhiệm vụ được (event_locked)", async () => {
    await event();
    const t = await task("learn", 5);
    await publish();
    await expect(task("play", 1)).rejects.toThrow(/event_locked/);
    await expect(pg.query(`update event_tasks set target = 9 where id = $1`, [t])).rejects.toThrow(/event_locked/);
    await expect(pg.query(`delete from event_tasks where id = $1`, [t])).rejects.toThrow(/event_locked/);
  });

  it("đã có người có tiến độ thì không đưa về nháp được; chưa có thì được", async () => {
    await event();
    await task("learn", 5);
    await publish();
    await pg.query(`update seasonal_events set status = 'draft' where key = $1`, [EV.key]); // chưa ai có tiến độ
    await publish();
    await bump(U1, IN, { learn: 1 });
    await expect(pg.query(`update seasonal_events set status = 'draft' where key = $1`, [EV.key])).rejects.toThrow(/event_has_progress/);
  });

  it("không xóa được sự kiện đã xuất bản; xóa nháp thì xóa luôn nhiệm vụ", async () => {
    await event();
    await task("learn", 5);
    await publish();
    await expect(pg.query(`delete from seasonal_events where key = $1`, [EV.key])).rejects.toThrow(/event_published/);
    await pg.query(`update seasonal_events set status = 'draft' where key = $1`, [EV.key]);
    await pg.query(`delete from seasonal_events where key = $1`, [EV.key]);
    expect((await pg.query(`select 1 from event_tasks`)).rows).toEqual([]);
  });

  it("target của nhiệm vụ 'all' tự bằng số nhiệm vụ khác (thêm/xóa đều cập nhật, không đệ quy)", async () => {
    await event();
    const all = await task("all", 99);
    const target = async () => Number((await pg.query<{ target: number }>(`select target from event_tasks where id = $1`, [all])).rows[0]!.target);
    expect(await target()).toBe(1); // chưa có nhiệm vụ nào khác → tối thiểu 1
    const a = await task("learn", 5);
    await task("play", 1);
    expect(await target()).toBe(2);
    await pg.query(`delete from event_tasks where id = $1`, [a]);
    expect(await target()).toBe(1);
  });

  it("sao chép: nhiệm vụ + thưởng sang đợt mới ở trạng thái nháp, lịch mới", async () => {
    await cat("hat", "frame", { days: 30 });
    await event();
    await task("learn", 5, { cos: "hat" });
    await task("all", 1, { xp: 200 });
    await publish();
    await pg.query(`select event_duplicate($1, 'xmas-2027', $2, $3)`, [EV.key, D("2027-12-15"), D("2027-12-27")]);
    const e = (await pg.query<{ status: string; starts_at: string }>(`select status, starts_at from seasonal_events where key = 'xmas-2027'`)).rows[0]!;
    expect(e.status).toBe("draft");
    const t = (await pg.query<{ metric: string; target: number; reward_cosmetic: string | null }>(`select metric, target, reward_cosmetic from event_tasks where event_key = 'xmas-2027' order by metric`)).rows;
    expect(t).toEqual([{ metric: "all", target: 1, reward_cosmetic: null }, { metric: "learn", target: 5, reward_cosmetic: "hat" }]);
    await expect(pg.query(`select event_duplicate('khong-co', 'moi-1', now(), now() + interval '3 days')`)).rejects.toThrow(/event_not_found/);
  });
});

describe("bump_event_progress", () => {
  it("chỉ tính khi sự kiện đã xuất bản và đang diễn ra; mốc bắt đầu bao gồm, mốc kết thúc loại trừ", async () => {
    await event();
    const t = await task("learn", 10);
    await bump(U1, IN, { learn: 3 });
    expect(await prog(U1, t)).toBeNull(); // nháp: không ghi
    await publish();
    await bump(U1, BEFORE, { learn: 3 });
    await bump(U1, GRACE, { learn: 3 });
    expect(await prog(U1, t)).toBeNull(); // trước giờ / sau giờ: không ghi
    await bump(U1, EV.starts, { learn: 1 });
    await bump(U1, "2026-12-26T23:59:59+07:00", { learn: 1 });
    await bump(U1, EV.ends, { learn: 1 }); // đúng ends_at: đã hết
    expect(await prog(U1, t)).toEqual({ progress: 2, claimed: false });
  });

  it("cộng dồn theo từng metric, chặn ở mục tiêu, bỏ qua số âm/null; không tạo dòng khi không có gì để cộng", async () => {
    await event();
    const learn = await task("learn", 5);
    const play = await task("play", 2);
    await publish();
    await bump(U1, IN, { learn: 3, play: 1 });
    await bump(U1, IN, { learn: 4, play: -5 });
    expect(await prog(U1, learn)).toMatchObject({ progress: 5 }); // 7 → chặn ở 5
    expect(await prog(U1, play)).toMatchObject({ progress: 1 });
    await bump(U2, IN, { review: 9, test: 1 }); // không có nhiệm vụ khớp
    await bump(U2, IN, {});
    expect((await pg.query(`select 1 from event_progress where user_id = $1`, [U2])).rows).toEqual([]);
  });

  it("hai người không lẫn tiến độ", async () => {
    await event();
    const t = await task("play", 3);
    await publish();
    await bump(U1, IN, { play: 2 });
    await bump(U2, IN, { play: 1 });
    expect(await prog(U1, t)).toMatchObject({ progress: 2 });
    expect(await prog(U2, t)).toMatchObject({ progress: 1 });
  });

  it("'all' = số nhiệm vụ khác đã đủ", async () => {
    await event();
    const a = await task("learn", 2);
    const b = await task("play", 1);
    const all = await task("all", 1, { xp: 300 });
    await publish();
    await bump(U1, IN, { learn: 2 });
    expect(await prog(U1, all)).toMatchObject({ progress: 1 });
    await bump(U1, IN, { play: 1 });
    expect(await prog(U1, all)).toMatchObject({ progress: 2 });
    expect(await prog(U1, a)).toMatchObject({ progress: 2 });
    expect(await prog(U1, b)).toMatchObject({ progress: 1 });
  });
});

describe("claim_event_task", () => {
  it("nhận XP: cộng vào profiles.xp, KHÔNG đụng xp_today; nhận lần hai bị chặn", async () => {
    await event();
    const t = await task("play", 1, { xp: 80 });
    await publish();
    await bump(U1, IN, { play: 1 });
    const before = (await pg.query<{ xp_today: number }>(`select xp_today from profiles where id = $1`, [U1])).rows[0]!.xp_today;
    expect(await claim(U1, t, IN)).toEqual({ reward_xp: 80, xp: 80, cosmetic: null, granted: false });
    expect(await xp(U1)).toBe(80);
    expect((await pg.query<{ xp_today: number }>(`select xp_today from profiles where id = $1`, [U1])).rows[0]!.xp_today).toBe(before);
    expect(await prog(U1, t)).toEqual({ progress: 1, claimed: true });
    await expect(claim(U1, t, IN)).rejects.toThrow(/task_already_claimed/);
    expect(await xp(U1)).toBe(80);
  });

  it("chưa đủ tiến độ / chưa có dòng / nhiệm vụ không tồn tại", async () => {
    await event();
    const t = await task("learn", 5);
    await publish();
    await expect(claim(U1, t, IN)).rejects.toThrow(/task_not_ready/);
    await bump(U1, IN, { learn: 4 });
    await expect(claim(U1, t, IN)).rejects.toThrow(/task_not_ready/);
    await expect(claim(U1, 999999, IN)).rejects.toThrow(/task_not_found/);
    expect(await xp(U1)).toBe(0);
  });

  it("cửa nhận: chưa xuất bản / chưa tới giờ → không; hết giờ làm nhưng còn trong claim_days → nhận được; quá hạn → không", async () => {
    await event();
    const t = await task("play", 1);
    await expect(claim(U1, t, IN)).rejects.toThrow(/event_not_running/); // nháp
    await publish();
    await bump(U1, IN, { play: 1 });
    await expect(claim(U1, t, BEFORE)).rejects.toThrow(/event_not_running/);
    await expect(claim(U1, t, AFTER)).rejects.toThrow(/event_not_running/);
    expect((await claim(U1, t, GRACE)).reward_xp).toBe(50); // 28/12: sau 27/12 nhưng trong 2 ngày nhận thưởng
    // và sau khi hết giờ không thể tăng tiến độ nữa
    await bump(U2, GRACE, { play: 1 });
    expect(await prog(U2, t)).toBeNull();
  });

  it("cấp cosmetic có hạn dùng theo duration_days của món; sự kiện + phần vĩnh viễn trong cùng một đợt", async () => {
    await cat("hat", "frame", { days: 30 });
    await cat("owl", "avatar", { days: null });
    await event();
    const a = await task("learn", 1, { xp: 0, cos: "hat" });
    const b = await task("play", 1, { xp: 0, cos: "owl" });
    await publish();
    await bump(U1, IN, { learn: 1, play: 1 });
    expect(await claim(U1, a, IN)).toMatchObject({ cosmetic: "hat", granted: true });
    expect(await claim(U1, b, IN)).toMatchObject({ cosmetic: "owl", granted: true });
    const hat = (await owned(U1, "hat"))!;
    expect(hat.source).toBe("event");
    expect(hat.seen_at).toBeNull();
    const days = (await pg.query<{ d: number }>(`select extract(epoch from (expires_at - now())) / 86400 as d from user_cosmetics where user_id = $1 and cosmetic_id = 'hat'`, [U1])).rows[0]!.d;
    expect(Number(days)).toBeGreaterThan(29.9);
    expect(Number(days)).toBeLessThanOrEqual(30);
    expect((await owned(U1, "owl"))!.expires_at).toBeNull();
  });

  it("đang còn món thì không gia hạn, không cộng dồn (granted = false), XP vẫn được cộng", async () => {
    await cat("hat", "frame", { days: 30 });
    await event();
    const t = await task("learn", 1, { xp: 40, cos: "hat" });
    await publish();
    await pg.query(`select grant_cosmetic($1, 'hat', 'grant')`, [U1]);
    const before = (await owned(U1, "hat"))!.expires_at;
    await bump(U1, IN, { learn: 1 });
    expect(await claim(U1, t, IN)).toMatchObject({ granted: false, xp: 40 });
    expect(new Date((await owned(U1, "hat"))!.expires_at!).getTime()).toBe(new Date(before!).getTime());
  });

  it("món không cấp được (ngừng cung cấp / quá cửa nhận của món) → hoàn tác TẤT CẢ: chưa nhận, chưa cộng XP", async () => {
    await cat("old", "frame", { active: false });
    await event();
    const t = await task("learn", 1, { xp: 70, cos: "old" });
    await publish();
    await bump(U1, IN, { learn: 1 });
    await expect(claim(U1, t, IN)).rejects.toThrow(/cosmetic_unavailable/);
    expect(await xp(U1)).toBe(0);
    expect(await prog(U1, t)).toEqual({ progress: 1, claimed: false });
    // admin sửa lại món → nhận được
    await pg.query(`update cosmetics set active = true where id = 'old'`);
    expect(await claim(U1, t, IN)).toMatchObject({ xp: 70, granted: true });
  });

  it("'all' chỉ nhận khi mọi nhiệm vụ khác đã đủ; tính lại từ dữ liệu thật", async () => {
    await event();
    const a = await task("learn", 1);
    await task("play", 1);
    const all = await task("all", 1, { xp: 300 });
    await publish();
    await bump(U1, IN, { learn: 1 });
    await expect(claim(U1, all, IN)).rejects.toThrow(/task_not_ready/);
    await bump(U1, IN, { play: 1 });
    expect(await claim(U1, all, IN)).toMatchObject({ reward_xp: 300 });
    // nhận 'all' không cần nhận từng nhiệm vụ con trước, và con vẫn nhận được sau đó
    expect(await claim(U1, a, IN)).toMatchObject({ reward_xp: 50 });
    expect(await xp(U1)).toBe(350);
  });

  it("'all' không có dòng tiến độ (chưa từng bump) vẫn tính đúng khi nhận", async () => {
    await event();
    const a = await task("learn", 1);
    const all = await task("all", 1, { xp: 10 });
    await publish();
    await pg.query(`insert into event_progress (user_id, task_id, progress) values ($1, $2, 1)`, [U1, a]); // ghi thẳng, không qua bump
    expect(await claim(U1, all, IN)).toMatchObject({ reward_xp: 10 });
  });
});

describe("event_stats", () => {
  it("đếm người tham gia (có tiến độ) và lượt nhận thưởng theo từng đợt; đợt chưa ai chơi không có dòng", async () => {
    await event();
    await event({ key: "tet-2027", starts: D("2027-02-01"), ends: D("2027-02-10") });
    const a = await task("learn", 1);
    await task("play", 1);
    await publish();
    await bump(U1, IN, { learn: 1, play: 1 });
    await bump(U2, IN, { learn: 1 });
    await claim(U1, a, IN);
    await claim(U2, a, IN);
    const r = (await pg.query<{ event_key: string; participants: number; claims: number }>(`select * from event_stats(array['xmas-2026', 'tet-2027'])`)).rows;
    expect(r).toEqual([{ event_key: "xmas-2026", participants: 2, claims: 2 }]);
  });
});

describe("vòng đời trọn vẹn: nhận → hết hạn → chạy lại → nhận lại", () => {
  it("món 30 ngày hết hạn, đợt mới (năm sau) nhận lại thì tính lại từ ngày nhận, báo lại mở khóa", async () => {
    await cat("hat", "frame", { days: 30 });
    await event();
    const t1 = await task("learn", 1, { xp: 0, cos: "hat" });
    await publish();
    await bump(U1, IN, { learn: 1 });
    await claim(U1, t1, IN);
    await pg.query(`update user_cosmetics set seen_at = now(), warned = 1 where user_id = $1`, [U1]); // đã được báo

    // 31 ngày sau món hết hạn (mô phỏng bằng cách lùi expires_at; hạn dùng so với giờ server ở lớp trên)
    await pg.query(`update user_cosmetics set expires_at = now() - interval '1 day' where user_id = $1 and cosmetic_id = 'hat'`, [U1]);

    // admin sao chép sang năm sau, xuất bản
    await pg.query(`select event_duplicate($1, 'xmas-2027', $2, $3)`, [EV.key, D("2027-12-15"), D("2027-12-27")]);
    await publish("xmas-2027");
    const t2 = Number((await pg.query<{ id: string }>(`select id from event_tasks where event_key = 'xmas-2027'`)).rows[0]!.id);
    const IN2 = "2027-12-20T10:00:00+07:00";
    await bump(U1, IN2, { learn: 1 });
    expect(await prog(U1, t2)).toMatchObject({ progress: 1 }); // tiến độ năm cũ không dính sang
    expect(await claim(U1, t2, IN2)).toMatchObject({ cosmetic: "hat", granted: true });

    const again = (await owned(U1, "hat"))!;
    expect(again.seen_at).toBeNull(); // báo lại
    expect(new Date(again.expires_at!).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000); // tính lại từ bây giờ, không cộng dồn
    expect((await pg.query<{ warned: number }>(`select warned from user_cosmetics where user_id = $1 and cosmetic_id = 'hat'`, [U1])).rows[0]!.warned).toBe(0);
  });
});
