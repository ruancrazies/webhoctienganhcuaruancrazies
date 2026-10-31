import type { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./helpers";

/** Giai đoạn 4 (migration 0016): so sánh trước/sau theo từng người. */

let pg: PGlite;
const one = async <T extends object>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows[0];
const all = async <T extends object>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows;
const num = (v: unknown) => Number(v);
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ref = async (n: number) => (await one<{ r: string }>(`select analytics_private.user_ref($1) r`, [uid(n)])).r;

/** `days` ngày trước, 12:00 giờ VN. */
const at = (days: number) =>
  `((now() at time zone 'Asia/Ho_Chi_Minh')::date - ${days} + time '12:00') at time zone 'Asia/Ho_Chi_Minh'`;

/** n câu trả lời (k đúng) của một người trong một ngày. */
async function answers(user: number, daysAgo: number, n: number, correct: number) {
  for (let i = 0; i < n; i++) {
    await pg.query(
      `insert into answer_events (user_id, source, source_id, qid, game, part, correct, answered_at)
       values ($1, 'round', gen_random_uuid(), 'q1', 'quiz', 'vocab', $2, ${at(daysAgo)})`, [uid(user), i < correct]);
  }
}
const setStart = (name: "rules" | "ai", daysAgo: number) =>
  pg.query(`insert into analytics_private.interventions (intervention, started_at) values ($1, ${at(daysAgo)})
            on conflict (intervention) do update set started_at = excluded.started_at`, [name]);

beforeAll(async () => {
  ({ pg } = await freshDb());
  await pg.exec(`insert into auth.users (id, email, raw_user_meta_data)
                 select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'u' || n || '@x.vn', jsonb_build_object('username', 'User_' || lpad(n::text, 2, '0'))
                   from generate_series(1, 6) n`);
}, 60000);
afterAll(() => pg.close());

describe("sign_test_p", () => {
  const p = async (up: number, down: number) => (await one<{ p: string | null }>(`select analytics_private.sign_test_p($1, $2) p`, [up, down])).p;
  it("khớp giá trị tính tay của phân phối nhị thức", async () => {
    expect(num(await p(8, 2))).toBeCloseTo(0.1094, 4); // 2·(1+10+45)/1024
    expect(num(await p(5, 0))).toBeCloseTo(0.0625, 4); // 2/32
    expect(num(await p(0, 5))).toBeCloseTo(0.0625, 4); // đối xứng
    expect(num(await p(1, 1))).toBe(1);                // chặn trên ở 1
    expect(num(await p(3, 3))).toBe(1);
  });
  it("không ai đổi → NULL; metabase_ro gọi được (view cần), anon / authenticated thì không", async () => {
    expect(await p(0, 0)).toBeNull();
    await pg.exec(`set role metabase_ro`);
    try { expect((await one<{ p: string }>(`select analytics_private.sign_test_p(1, 1) p`)).p).toBeTruthy(); }
    finally { await pg.exec(`reset role`); }
    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`set role ${role}`);
      try { await expect(pg.query(`select analytics_private.sign_test_p(1, 1)`)).rejects.toThrow(/permission denied/); }
      finally { await pg.exec(`reset role`); }
    }
  });
});

describe("intervention_windows", () => {
  it("chưa có dữ liệu: không có dòng nào", async () => {
    expect(await all(`select * from analytics.intervention_windows`)).toEqual([]);
    expect(await all(`select * from analytics.effect_by_user`)).toEqual([]);
    expect(await all(`select * from analytics.effect_summary`)).toEqual([]);
  });

  it("rules: mốc suy ra từ sự kiện hoạt động đầu tiên; ai: từ lời nhắn coach AI đầu tiên (lời nhắn 'rule' không tính)", async () => {
    await pg.query(`insert into activity_events (user_id, type, at) values ($1, 'play/start', ${at(30)}), ($1, 'play/start', ${at(3)})`, [uid(1)]);
    const r = await one<{ intervention: string; window_days: number; ready: boolean }>(`select intervention, window_days, ready from analytics.intervention_windows`);
    expect(r).toEqual({ intervention: "rules", window_days: 14, ready: true }); // 30 ngày trước → tối đa 14

    await pg.query(`insert into coach_messages (user_id, day, message, source, created_at) values ($1, 1, 'x', 'rule', ${at(20)})`, [uid(1)]);
    expect((await all(`select * from analytics.intervention_windows where intervention = 'ai'`)).length).toBe(0);
    await pg.query(`insert into coach_messages (user_id, day, message, source, created_at) values ($1, 2, 'x', 'ai', ${at(4)})`, [uid(1)]);
    const ai = await one<{ window_days: number; ready: boolean }>(`select window_days, ready from analytics.intervention_windows where intervention = 'ai'`);
    expect(ai).toEqual({ window_days: 3, ready: false }); // ngày bắt đầu và hôm nay không tính: 4 − 1 = 3 ngày trọn vẹn
    await pg.exec(`delete from coach_messages; delete from activity_events`);
  });

  it("bảng ghi đè thắng giá trị suy ra; cửa sổ = số ngày trọn vẹn sau mốc", async () => {
    await setStart("rules", 10);
    expect(await one(`select window_days, ready from analytics.intervention_windows where intervention = 'rules'`)).toEqual({ window_days: 9, ready: true });
    await setStart("rules", 2); // chỉ 1 ngày trọn vẹn (hôm qua)
    expect(await one(`select window_days, ready from analytics.intervention_windows where intervention = 'rules'`)).toEqual({ window_days: 1, ready: false });
    await setStart("rules", 0); // mốc hôm nay: chưa có ngày nào
    expect(await one(`select window_days from analytics.intervention_windows where intervention = 'rules'`)).toEqual({ window_days: 0 });
  });

  it("chỉ nhận 'rules' hoặc 'ai' ở bảng ghi đè", async () => {
    await expect(pg.query(`insert into analytics_private.interventions (intervention, started_at) values ('x', now())`)).rejects.toThrow();
  });
});

describe("effect_by_user và effect_summary (mốc 'rules' cách đây 10 ngày → cửa sổ 9 ngày)", () => {
  // trước: hôm nay − 19 … − 11; sau: − 9 … − 1; ngày − 10 là ngày bắt đầu (bỏ); hôm nay không tính.
  beforeAll(async () => {
    await setStart("rules", 10);
    // U1: tiến bộ 5/10 → 8/10; học 2 ngày trước, 3 ngày sau
    await answers(1, 15, 5, 3); await answers(1, 12, 5, 2);
    await answers(1, 8, 4, 3);  await answers(1, 5, 3, 2); await answers(1, 2, 3, 3);
    // U2: sa sút 9/10 → 5/10; 2 ngày trước, 1 ngày sau
    await answers(2, 14, 10, 9);
    await answers(2, 3, 10, 5);
    // U3: bỏ hẳn sau mốc (có dòng, số ngày học sau = 0, accuracy_after rỗng)
    await answers(3, 13, 12, 6);
    // U4: chỉ có sau mốc (không có nền → không xuất hiện); câu trả lời ngày bắt đầu và hôm nay cũng không tính
    await answers(4, 4, 12, 12);
    await answers(1, 10, 20, 0); // ngày bắt đầu của U1: không được tính vào trước hay sau
    await answers(1, 0, 20, 0);  // hôm nay
    // U5: không đổi độ chính xác: 6/10 → 6/10
    await answers(5, 16, 10, 6); await answers(5, 6, 10, 6);
  });

  it("chỉ người có nền; ngày bắt đầu và hôm nay không lọt vào số đếm", async () => {
    const rows = await all<Record<string, unknown>>(`select * from analytics.effect_by_user where intervention = 'rules' order by user_ref`);
    expect(rows.length).toBe(4); // U1, U2, U3, U5 (U4 không có nền)
    const u1 = await one<Record<string, unknown>>(`select * from analytics.effect_by_user where intervention = 'rules' and user_ref = $1`, [await ref(1)]);
    expect(u1).toMatchObject({
      window_days: 9, ready: true, answers_before: 10, correct_before: 5, answers_after: 10, correct_after: 8,
      active_days_before: 2, active_days_after: 3, exposed: true, coach_days_after: 0,
    });
    expect(num(u1.accuracy_before)).toBe(0.5);
    expect(num(u1.accuracy_after)).toBe(0.8);
  });

  it("người bỏ hẳn vẫn có dòng: số ngày học sau = 0, độ chính xác sau rỗng", async () => {
    const u3 = await one<Record<string, unknown>>(`select * from analytics.effect_by_user where user_ref = $1`, [await ref(3)]);
    expect(u3).toMatchObject({ answers_before: 12, answers_after: 0, active_days_before: 1, active_days_after: 0, accuracy_after: null });
  });

  it("độ chính xác chỉ có khi ≥ 10 câu; tỉ lệ bỏ dở chỉ có khi ≥ 3 vòng", async () => {
    await answers(6, 14, 9, 9); await answers(6, 3, 12, 6); // trước: 9 câu → chưa đủ
    const u6 = await one<Record<string, unknown>>(`select * from analytics.effect_by_user where user_ref = $1`, [await ref(6)]);
    expect(u6.accuracy_before).toBeNull();
    expect(num(u6.accuracy_after)).toBe(0.5);
    expect(u6.abandon_before).toBeNull();
    await pg.exec(`delete from answer_events where user_id = '${uid(6)}'`);
  });

  it("summary: số người cải thiện / không đổi / xấu đi theo từng chỉ số", async () => {
    const rows = await all<Record<string, unknown>>(`select * from analytics.effect_summary where intervention = 'rules'`);
    const by = Object.fromEntries(rows.map((r) => [r.metric as string, r]));
    // độ chính xác: U1 +0,3 (tốt), U2 −0,4 (xấu), U5 0 (không đổi); U3 thiếu số liệu sau → loại
    expect(by.accuracy).toMatchObject({ exposure: "exposed", better_if: "higher", users: 3, improved: 1, unchanged: 1, worsened: 1, window_days: 9, ready: true });
    expect(num(by.accuracy.median_delta)).toBe(0);
    expect(num(by.accuracy.sign_test_p)).toBe(1); // 1 lên, 1 xuống
    // số ngày học: U1 +1 (2 → 3), U2 0 (1 → 1), U3 −1 (1 → 0), U5 0 (1 → 1)
    expect(by.active_days).toMatchObject({ users: 4, improved: 1, unchanged: 2, worsened: 1 });
    expect(num(by.active_days.median_delta)).toBe(0);
    // lượng câu: U1 0, U2 0, U3 −12, U5 0 (U1 10 → 10; U2 10 → 10; U5 10 → 10)
    expect(by.answers).toMatchObject({ users: 4, improved: 0, unchanged: 3, worsened: 1 });
    // chưa ai có bài kiểm tra hay ≥ 3 vòng → hai chỉ số này không có dòng
    expect(by.practice_score).toBeUndefined();
    expect(by.abandon_rate).toBeUndefined();
  });

  it("điểm bài kiểm tra và tỉ lệ bỏ dở: dùng đúng hướng 'tốt hơn'", async () => {
    for (const [d, score] of [[15, 0.5], [5, 0.8]] as const)
      await pg.query(`insert into practice_tests (user_id, items, expires_at, finished_at, score_total) values ($1, '[]', now(), ${at(d)}, $2)`, [uid(1), score]);
    // U2: 4 vòng trước (3 bỏ dở), 4 vòng sau (1 bỏ dở) → tỉ lệ bỏ dở giảm = tốt hơn
    for (const [d, fin] of [[14, false], [14, false], [13, false], [13, true], [4, false], [4, true], [3, true], [3, true]] as const)
      await pg.query(`insert into game_rounds (user_id, game, items, created_at, finished_at) values ($1, 'quiz', '[]', ${at(d)}, ${fin ? at(d) : "null"})`, [uid(2)]);
    const rows = await all<Record<string, unknown>>(`select * from analytics.effect_summary where intervention = 'rules' and metric in ('practice_score', 'abandon_rate')`);
    const by = Object.fromEntries(rows.map((r) => [r.metric as string, r]));
    expect(by.practice_score).toMatchObject({ users: 1, improved: 1, worsened: 0, better_if: "higher" });
    expect(num(by.practice_score.median_delta)).toBeCloseTo(0.3, 4);
    expect(by.abandon_rate).toMatchObject({ users: 1, improved: 1, worsened: 0, better_if: "lower" });
    expect(num(by.abandon_rate.median_delta)).toBeCloseTo(-0.5, 4); // 0,75 → 0,25
  });
});

describe("can thiệp 'ai': nhóm exposed / not_exposed", () => {
  it("exposed = nhận ≥ 3 lời nhắn AI trong cửa sổ sau; người còn lại vào not_exposed", async () => {
    await setStart("ai", 10);
    for (const day of [1, 2, 3]) await pg.query(`insert into coach_messages (user_id, day, message, source, created_at) values ($1, $2, 'x', 'ai', ${at(10 - day)})`, [uid(1), day]);
    for (const day of [11, 12]) await pg.query(`insert into coach_messages (user_id, day, message, source, created_at) values ($1, $2, 'x', 'ai', ${at(10 - day + 10)})`, [uid(2), day]); // chỉ 2 lời nhắn (một ngoài cửa sổ)
    const rows = await all<{ user_ref: string; exposed: boolean; coach_days_after: number }>(`select user_ref, exposed, coach_days_after from analytics.effect_by_user where intervention = 'ai'`);
    const m = new Map(rows.map((r) => [r.user_ref, r]));
    expect(m.get(await ref(1))).toMatchObject({ exposed: true, coach_days_after: 3 });
    expect(m.get(await ref(2))!.exposed).toBe(false);
    const groups = await all<{ exposure: string }>(`select distinct exposure from analytics.effect_summary where intervention = 'ai' order by 1`);
    expect(groups.map((g) => g.exposure)).toEqual(["exposed", "not_exposed"]);
  });

  it("ai_coach_usage đếm lời nhắn và số người theo ngày VN", async () => {
    const rows = await all<{ day: string; messages: number; users: number }>(`select day::text, messages, users from analytics.ai_coach_usage order by day`);
    expect(rows.reduce((a, r) => a + r.messages, 0)).toBe(5);
    expect(Math.max(...rows.map((r) => r.users))).toBe(2); // hai người cùng nhận lời nhắn trong một ngày
  });
});

describe("quyền", () => {
  it("REGRESSION: metabase_ro đọc được MỌI cột của MỌI view trong analytics (không chỉ count(*)); hàm bên trong view cần quyền của người đọc", async () => {
    await pg.exec(`insert into analytics_private.interventions (intervention, started_at) values ('ai', now() - interval '10 days') on conflict do nothing`);
    const views = await all<{ viewname: string }>(`select viewname from pg_views where schemaname = 'analytics' order by 1`);
    expect(views.length).toBeGreaterThanOrEqual(12);
    await pg.exec(`set role metabase_ro`);
    try {
      for (const { viewname } of views) await pg.query(`select * from analytics.${viewname}`);
    } finally { await pg.exec(`reset role`); }
  });

  it("metabase_ro đọc được bốn view mới; không đọc được bảng ghi đè; view không có user_id/username/email", async () => {
    await pg.exec(`set role metabase_ro`);
    try {
      for (const v of ["intervention_windows", "effect_by_user", "effect_summary", "ai_coach_usage"]) await pg.query(`select * from analytics.${v} limit 1`);
      await expect(pg.query(`select * from analytics_private.interventions`)).rejects.toThrow(/permission denied/);
      await expect(pg.query(`insert into analytics_private.interventions values ('rules', now(), null)`)).rejects.toThrow(/permission denied/);
    } finally { await pg.exec(`reset role`); }
    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`set role ${role}`);
      try { await expect(pg.query(`select * from analytics.effect_summary`)).rejects.toThrow(/permission denied/); }
      finally { await pg.exec(`reset role`); }
    }
    const cols = await all<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'analytics'
        and table_name in ('intervention_windows', 'effect_by_user', 'effect_summary', 'ai_coach_usage') and column_name ~* '(user_id|username|email)'`);
    expect(cols).toEqual([]);
  });
});

describe("câu hỏi Metabase của dashboard 'Hiệu quả gợi ý'", () => {
  const dir = path.join(__dirname, "..", "..", "scripts", "metabase", "questions");
  const files = readdirSync(dir).filter((f) => /^2[3-8]-/.test(f)).sort();
  it("có đủ 6 file, cùng dashboard 'effect'", () => {
    expect(files).toHaveLength(6);
    for (const f of files) expect(readFileSync(path.join(dir, f), "utf8")).toMatch(/^-- dashboard: effect$/m);
  });
  for (const f of files) {
    it(`${f}: chạy được và có cột`, async () => {
      const sql = readFileSync(path.join(dir, f), "utf8");
      const r = await pg.query(sql);
      expect(r.fields.length).toBeGreaterThan(0);
    });
  }
});
