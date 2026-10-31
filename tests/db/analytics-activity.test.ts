import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./helpers";

/** Giai đoạn 2 (migration 0014): record_activity, game_response_medians, user_ref và các view của hai dashboard. */

let pg: PGlite;
const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const U3 = "33333333-3333-3333-3333-333333333333";

const one = async <T extends object>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows[0];
const all = async <T extends object>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows;
const num = (v: unknown) => Number(v);

/** Một thời điểm cố định trong quá khứ gần (giờ VN: 2 ngày trước lúc `hourVn`). */
const daysAgoAt = (days: number, hourVn: number, minute = 0) =>
  `((now() at time zone 'Asia/Ho_Chi_Minh')::date - ${days} + time '${String(hourVn).padStart(2, "0")}:${String(minute).padStart(2, "0")}') at time zone 'Asia/Ho_Chi_Minh'`;

const act = (user: string, type: string, atSql: string, session: string | null = null) =>
  pg.query(`insert into activity_events (user_id, session_id, type, at) values ($1, $2, $3, ${atSql})`, [user, session, type]);
const ans = (user: string, atSql: string, correct = true, game = "quiz", ms: number | null = null) =>
  pg.query(
    `insert into answer_events (user_id, source, source_id, qid, game, part, correct, response_ms, answered_at)
     values ($1, 'round', gen_random_uuid(), 'q1', $2, 'vocab', $3, $4, ${atSql})`,
    [user, game, correct, ms],
  );
const round = (user: string, atSql: string, finished: boolean) =>
  pg.query(`insert into game_rounds (user_id, game, items, created_at, finished_at) values ($1, 'quiz', '[]', ${atSql}, ${finished ? atSql : "null"})`, [user]);

beforeAll(async () => {
  ({ pg } = await freshDb());
  await pg.exec(
    `insert into auth.users (id, email, raw_user_meta_data) values
       ('${U1}', 'a@x.vn', '{"username":"Alice_01"}'), ('${U2}', 'b@x.vn', '{"username":"Bob_02"}'), ('${U3}', 'c@x.vn', '{"username":"Cara_03"}')`,
  );
}, 60000);
afterAll(() => pg.close());

describe("record_activity: phiên tính phía server", () => {
  const rec = async (user: string, type: string, props: object | null = {}) =>
    (await one<{ s: string }>(`select record_activity($1, $2, $3::jsonb) as s`, [user, type, props === null ? null : JSON.stringify(props)])).s;

  it("hai sự kiện liền nhau cùng một phiên", async () => {
    const a = await rec(U1, "play/start", { game: "quiz" });
    const b = await rec(U1, "play/finish", { game: "quiz" });
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(b).toBe(a);
    const rows = await all<{ type: string; session_id: string; props: { game: string } }>(`select type, session_id, props from activity_events where user_id = $1 order by id`, [U1]);
    expect(rows.map((r) => r.type)).toEqual(["play/start", "play/finish"]);
    expect(rows[0].props).toEqual({ game: "quiz" });
  });

  it("nghỉ ≥ 30 phút thì sang phiên mới; dưới 30 phút vẫn cùng phiên", async () => {
    const first = (await one<{ session_id: string }>(`select session_id from activity_events where user_id = $1 order by id limit 1`, [U1])).session_id;
    // lùi toàn bộ sự kiện của U1 về 29 phút trước → vẫn cùng phiên
    await pg.exec(`update activity_events set at = now() - interval '29 minutes' where user_id = '${U1}'`);
    expect(await rec(U1, "learn/words")).toBe(first);
    // lùi về 31 phút trước → phiên mới
    await pg.exec(`update activity_events set at = now() - interval '31 minutes' where user_id = '${U1}'`);
    const next = await rec(U1, "learn/mark");
    expect(next).not.toBe(first);
    expect(await rec(U1, "quests/claim")).toBe(next);
  });

  it("mỗi người một phiên riêng", async () => {
    const a = await rec(U2, "play/start");
    const b = await rec(U3, "play/start");
    expect(a).not.toBe(b);
    expect(await rec(U2, "play/finish")).toBe(a);
  });

  it("props: không phải object / quá 2 KB / null → {}; type cắt 40 ký tự", async () => {
    await rec(U3, "t1", null);
    await rec(U3, "t2", { big: "x".repeat(3000) });
    await pg.query(`select record_activity($1, 't3', '[1,2]'::jsonb)`, [U3]);
    await pg.query(`select record_activity($1, $2, '{}'::jsonb)`, [U3, "y".repeat(100)]);
    const rows = await all<{ type: string; props: object }>(`select type, props from activity_events where user_id = $1 and type <> 'play/start' order by id`, [U3]);
    expect(rows.map((r) => r.props)).toEqual([{}, {}, {}, {}]);
    expect(rows[3].type).toHaveLength(40);
  });

  it("chỉ service_role được gọi; xoá người dùng xoá luôn hoạt động (cascade)", async () => {
    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`set role ${role}`);
      try { await expect(pg.query(`select record_activity('${U1}', 'x', '{}')`)).rejects.toThrow(/permission denied/); }
      finally { await pg.exec(`reset role`); }
    }
    await pg.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('44444444-4444-4444-4444-444444444444', 'd@x.vn', '{"username":"Dan_04"}')`);
    await rec("44444444-4444-4444-4444-444444444444", "play/start");
    await pg.exec(`delete from auth.users where id = '44444444-4444-4444-4444-444444444444'`);
    expect(num((await one<{ n: string }>(`select count(*) n from activity_events where user_id = '44444444-4444-4444-4444-444444444444'`)).n)).toBe(0);
  });
});

describe("game_response_medians", () => {
  it("chỉ game có ≥ 30 số đo; bỏ câu không có số đo", async () => {
    for (let i = 0; i < 31; i++) await ans(U1, `now() - interval '${i + 1} minutes'`, true, "quiz", 1000 + i * 10); // trung vị: 1150
    for (let i = 0; i < 10; i++) await ans(U1, `now() - interval '${i + 1} minutes'`, true, "type", 5000); // chỉ 10 số đo
    for (let i = 0; i < 40; i++) await ans(U1, `now() - interval '${i + 1} minutes'`, true, "cloze", null); // không có số đo
    const rows = await all<{ game: string; median_ms: number; n: string }>(`select * from game_response_medians(90)`);
    expect(rows.map((r) => ({ ...r, n: num(r.n) }))).toEqual([{ game: "quiz", median_ms: 1150, n: 31 }]);
  });

  it("cửa sổ ngày: bỏ số đo cũ hơn p_days", async () => {
    await pg.exec(`update answer_events set answered_at = now() - interval '100 days' where game = 'quiz'`);
    expect(await all(`select * from game_response_medians(90)`)).toEqual([]);
    expect((await all(`select * from game_response_medians(120)`)).length).toBe(1);
    await pg.exec(`update answer_events set answered_at = now() - interval '1 hour' where game = 'quiz'`);
  });

  it("chỉ service_role được gọi", async () => {
    await pg.exec(`set role authenticated`);
    try { await expect(pg.query(`select * from game_response_medians(90)`)).rejects.toThrow(/permission denied/); }
    finally { await pg.exec(`reset role`); }
  });
});

describe("user_ref", () => {
  it("16 ký tự hex, ổn định, khác nhau giữa người; không lộ user_id", async () => {
    const rows = await all<{ ref: string; id: string }>(
      `select analytics_private.user_ref(id) as ref, id::text as id from profiles order by id`);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const r of rows) {
      expect(r.ref).toMatch(/^[0-9a-f]{16}$/);
      expect(r.id).not.toContain(r.ref);
    }
    expect(new Set(rows.map((r) => r.ref)).size).toBe(rows.length);
    const again = await one<{ ref: string }>(`select analytics_private.user_ref('${U1}') as ref`);
    expect(again.ref).toBe(rows.find((r) => r.id === U1)!.ref);
  });

  it("muối: đúng một dòng, đủ dài, không hiện trong bất kỳ cột nào của view", async () => {
    const salt = await one<{ n: string; len: number; salt: string }>(`select count(*) n, max(length(salt)) len, max(salt) salt from analytics_private.user_salt`);
    expect(num(salt.n)).toBe(1);
    expect(salt.len).toBeGreaterThanOrEqual(32);
    await expect(pg.query(`insert into analytics_private.user_salt (only_row, salt) values (false, 'x')`)).rejects.toThrow(); // check (only_row)
    const hits = await one<{ n: string }>(`select count(*) n from analytics.user_levels where user_ref = '${salt.salt}'`);
    expect(num(hits.n)).toBe(0);
  });

  it("metabase_ro: đọc được view, KHÔNG đọc được muối (gọi được hàm băm từ 0016, vì view cần)", async () => {
    await pg.exec(`set role metabase_ro`);
    try {
      expect(num((await one<{ n: string }>(`select count(*) n from analytics.user_levels`)).n)).toBeGreaterThanOrEqual(3);
      await expect(pg.query(`select * from analytics_private.user_salt`)).rejects.toThrow(/permission denied/);
      // từ migration 0016: view gọi user_ref() nên người đọc view phải chạy được hàm; muối vẫn không đọc được (SECURITY DEFINER, bảng bị khoá)
      expect((await one<{ r: string }>(`select analytics_private.user_ref('${U1}') r`)).r).toMatch(/^[0-9a-f]{16}$/);
      await expect(pg.query(`select record_activity('${U1}', 'x', '{}')`)).rejects.toThrow(/permission denied/);
      await expect(pg.query(`select * from game_response_medians(90)`)).rejects.toThrow(/permission denied/);
      await expect(pg.query(`select * from activity_events limit 1`)).rejects.toThrow(/permission denied/);
      await expect(pg.query(`select * from user_insights limit 1`)).rejects.toThrow(/permission denied/);
    } finally {
      await pg.exec(`reset role`);
    }
  });

  it("cùng một người có cùng user_ref ở mọi view", async () => {
    await ans(U2, daysAgoAt(1, 9));
    await pg.query(
      `insert into level_exams (user_id, cefr, items, expires_at, finished_at, score_total, score_vocab, score_grammar, passed)
       values ($1, 'A1', '[]', now(), now(), 0.9, 0.9, 0.9, true)`, [U2]);
    const ref = (await one<{ r: string }>(`select analytics_private.user_ref($1) r`, [U2])).r;
    expect((await all<{ user_ref: string }>(`select user_ref from analytics.activity_daily`)).some((r) => r.user_ref === ref)).toBe(true);
    expect((await all<{ user_ref: string }>(`select user_ref from analytics.exam_scores`)).some((r) => r.user_ref === ref)).toBe(true);
    expect((await all<{ user_ref: string }>(`select user_ref from analytics.user_levels`)).some((r) => r.user_ref === ref)).toBe(true);
  });
});

describe("analytics.activity_daily", () => {
  it("gộp câu trả lời, phiên và vòng chơi theo (ngày giờ VN, người); vòng bỏ dở chỉ tính khi đã mở quá 1 giờ", async () => {
    // U3: 3 câu (2 đúng) + 2 sự kiện hoạt động cùng phiên cách nhau 20 phút + 3 vòng (1 nộp, 1 bỏ dở cũ, 1 vừa mở)
    await ans(U3, daysAgoAt(3, 10, 0), true);
    await ans(U3, daysAgoAt(3, 10, 5), true);
    await ans(U3, daysAgoAt(3, 10, 10), false);
    const sid = (await one<{ g: string }>(`select gen_random_uuid() g`)).g;
    await act(U3, "play/start", daysAgoAt(3, 10, 0), sid);
    await act(U3, "play/finish", daysAgoAt(3, 10, 20), sid);
    await round(U3, daysAgoAt(3, 10, 0), true);
    await round(U3, daysAgoAt(3, 11, 0), false); // bỏ dở: đã mở cách đây 3 ngày
    await pg.query(`insert into game_rounds (user_id, game, items, created_at) values ($1, 'quiz', '[]', now())`, [U3]); // vừa mở → chưa tính bỏ dở (và rơi vào hôm nay)

    const ref = (await one<{ r: string }>(`select analytics_private.user_ref($1) r`, [U3])).r;
    const day3 = await one<Record<string, unknown>>(
      `select * from analytics.activity_daily where user_ref = $1 and day = (now() at time zone 'Asia/Ho_Chi_Minh')::date - 3`, [ref]);
    expect(day3).toMatchObject({ answers: 3, correct: 2, sessions: 1, events: 2, rounds_started: 2, rounds_finished: 1, rounds_abandoned: 1 });
    expect(num(day3.session_minutes)).toBe(20);
    const today = await one<Record<string, unknown>>(
      `select * from analytics.activity_daily where user_ref = $1 and day = (now() at time zone 'Asia/Ho_Chi_Minh')::date`, [ref]);
    expect(today).toMatchObject({ answers: 0, rounds_started: 1, rounds_finished: 0, rounds_abandoned: 0 });
  });

  it("mỗi (ngày, người) đúng một dòng, không có cột nào chứa user_id thật", async () => {
    const dup = await all(`select day, user_ref from analytics.activity_daily group by 1, 2 having count(*) > 1`);
    expect(dup).toEqual([]);
    const cols = (await all<{ column_name: string }>(`select column_name from information_schema.columns where table_schema = 'analytics' and table_name = 'activity_daily'`)).map((c) => c.column_name);
    expect(cols).not.toContain("user_id");
  });

  it("session_minutes rỗng khi ngày đó chỉ có một sự kiện hoạt động", async () => {
    await act(U1, "learn/words", daysAgoAt(5, 8, 0));
    const ref = (await one<{ r: string }>(`select analytics_private.user_ref($1) r`, [U1])).r;
    const r = await one<{ session_minutes: string | null; events: string }>(
      `select session_minutes, events from analytics.activity_daily where user_ref = $1 and day = (now() at time zone 'Asia/Ho_Chi_Minh')::date - 5`, [ref]);
    expect(num(r.events)).toBe(1);
    expect(r.session_minutes).toBeNull();
  });
});

describe("analytics.user_cohorts", () => {
  const mkUser = async (n: number) => {
    const id = `66666666-6666-6666-6666-${String(n).padStart(12, "0")}`;
    await pg.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${id}', 'u${n}@x.vn', '{"username":"Cohort_${n}"}')`);
    return id;
  };
  const cohort = async (id: string) =>
    one<{ first_day: string; last_day: string; active_days: string; returned_7d: boolean; cohort_age_days: number; cohort_week: string }>(
      `select first_day::text, last_day::text, active_days, returned_7d, cohort_age_days, cohort_week::text
         from analytics.user_cohorts where user_ref = analytics_private.user_ref($1)`, [id]);

  it("hoạt động từ nhiều nguồn (câu trả lời, sự kiện, vòng chơi) cùng tính; ngày đầu, ngày cuối, số ngày", async () => {
    // U1: hoạt động 5 ngày trước (act ở trên) và hôm nay (record_activity ở trên)
    const c = await cohort(U1);
    expect(c.cohort_age_days).toBe(5);
    expect(c.returned_7d).toBe(true);
    expect(num(c.active_days)).toBeGreaterThanOrEqual(2);
    // U3: câu trả lời + vòng 3 ngày trước, vòng vừa mở hôm nay
    const c3 = await cohort(U3);
    expect(c3.cohort_age_days).toBe(3);
    expect(c3.returned_7d).toBe(true);
    expect(c3.cohort_week).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returned_7d: một ngày duy nhất → chưa quay lại; ngày thứ 7 sau ngày đầu vẫn tính; ngày thứ 8 thì không", async () => {
    const solo = await mkUser(1);
    await ans(solo, daysAgoAt(10, 9));
    expect(await cohort(solo)).toMatchObject({ cohort_age_days: 10, active_days: 1, returned_7d: false });

    const edge = await mkUser(2); // ngày đầu 10 ngày trước, quay lại đúng 7 ngày sau (3 ngày trước)
    await ans(edge, daysAgoAt(10, 9));
    await ans(edge, daysAgoAt(3, 9));
    expect(await cohort(edge)).toMatchObject({ active_days: 2, returned_7d: true });

    const late = await mkUser(3); // quay lại sau 8 ngày: ngoài cửa sổ
    await ans(late, daysAgoAt(10, 9));
    await ans(late, daysAgoAt(2, 9));
    expect(await cohort(late)).toMatchObject({ active_days: 2, returned_7d: false });
  });

  it("người chưa từng hoạt động không có dòng nhưng có trong user_levels (A1, chưa qua cấp nào)", async () => {
    await pg.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('55555555-5555-5555-5555-555555555555', 'e@x.vn', '{"username":"Eve_05"}')`);
    const ref = (await one<{ r: string }>(`select analytics_private.user_ref('55555555-5555-5555-5555-555555555555') r`)).r;
    expect(await all(`select * from analytics.user_cohorts where user_ref = $1`, [ref])).toEqual([]);
    expect(await one(`select current_level, passed_levels::int p from analytics.user_levels where user_ref = $1`, [ref])).toEqual({ current_level: "A1", p: 0 });
  });
});

describe("analytics.user_levels / exam_scores / hour_of_day", () => {
  it("cấp đang học: cấp đầu tiên chưa qua; qua hết A1–C1 thì C2", async () => {
    const ref = (id: string) => one<{ r: string }>(`select analytics_private.user_ref($1) r`, [id]).then((x) => x.r);
    const level = async (id: string) => {
      const r = await one<{ current_level: string; passed_levels: number | string }>(`select current_level, passed_levels from analytics.user_levels where user_ref = $1`, [await ref(id)]);
      return { current_level: r.current_level, passed_levels: num(r.passed_levels) };
    };
    expect(await level(U1)).toEqual({ current_level: "A1", passed_levels: 0 });
    await pg.exec(`insert into level_passes (user_id, cefr) values ('${U1}', 'A1'), ('${U1}', 'A2')`);
    expect(await level(U1)).toEqual({ current_level: "B1", passed_levels: 2 });
    // thủng một cấp giữa chừng (không xảy ra trong app, nhưng định nghĩa phải rõ): cấp đầu tiên chưa qua
    await pg.exec(`insert into level_passes (user_id, cefr) values ('${U2}', 'A2')`);
    expect(await level(U2)).toEqual({ current_level: "A1", passed_levels: 1 });
    await pg.exec(`insert into level_passes (user_id, cefr) values ('${U3}', 'A1'), ('${U3}', 'A2'), ('${U3}', 'B1'), ('${U3}', 'B2'), ('${U3}', 'C1')`);
    expect(await level(U3)).toEqual({ current_level: "C2", passed_levels: 5 });
  });

  it("exam_scores: gộp bài thi lên cấp và bài kiểm tra; bài hết giờ (chưa có điểm) không có", async () => {
    await pg.query(
      `insert into practice_tests (user_id, items, expires_at, finished_at, score_total, score_vocab, score_grammar, score_reading)
       values ($1, '[]', now(), now(), 0.7, 0.8, 0.6, 0.7)`, [U1]);
    await pg.query(`insert into practice_tests (user_id, items, expires_at, finished_at) values ($1, '[]', now(), now())`, [U1]); // hết giờ, không điểm
    await pg.query(`insert into level_exams (user_id, cefr, items, expires_at) values ($1, 'B1', '[]', now() + interval '1 hour')`, [U3]); // chưa nộp
    const rows = await all<{ kind: string; cefr: string | null; passed: boolean | null; total: string; reading: string | null }>(
      `select kind, cefr, passed, total, reading from analytics.exam_scores order by kind, total`);
    expect(rows.map((r) => r.kind)).toEqual(["exam", "practice"]);
    expect(rows[0]).toMatchObject({ cefr: "A1", passed: true, reading: null });
    expect(rows[1]).toMatchObject({ cefr: null, passed: null, total: "0.7", reading: "0.7" });
  });

  it("hour_of_day: đếm theo giờ VN, chỉ 60 ngày gần nhất", async () => {
    await pg.exec(`delete from answer_events`);
    await ans(U1, daysAgoAt(1, 21, 5));
    await ans(U1, daysAgoAt(1, 21, 40));
    await ans(U2, daysAgoAt(2, 21, 0));
    await ans(U2, daysAgoAt(1, 6, 0));
    await ans(U2, daysAgoAt(70, 12, 0)); // quá 60 ngày
    const rows = await all<{ hour: number; answers: string; users: string }>(`select hour, answers, users from analytics.hour_of_day order by hour`);
    expect(rows.map((r) => ({ hour: r.hour, answers: num(r.answers), users: num(r.users) }))).toEqual([{ hour: 6, answers: 1, users: 1 }, { hour: 21, answers: 3, users: 2 }]);
  });
});
