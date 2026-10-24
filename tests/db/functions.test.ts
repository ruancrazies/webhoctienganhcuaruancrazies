import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./helpers";

let pg: PGlite;
const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const wordIds: number[] = [];

const one = async <T extends object>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows[0];
const call = async (fn: string, ...args: unknown[]) =>
  (await one<{ r: unknown }>(`select ${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) as r`, args)).r;

async function newRound(user = U1): Promise<string> {
  return (await one<{ id: string }>(`insert into game_rounds (user_id, game, items) values ($1, 'quiz', '[]') returning id`, [user])).id;
}
const round = (id: string, user = U1, payload: object = {}) =>
  call("apply_round_result", user, id, JSON.stringify(payload) as unknown as object);

beforeAll(async () => {
  ({ pg } = await freshDb());
  await pg.exec(`insert into domains (code, title) values ('general', 'Chung')`);
  for (let i = 1; i <= 5; i++) {
    const r = await one<{ id: number }>(
      `insert into words (key, en, pos, vi, cefr, domain) values ($1, $2, 'n', $3, 'A1', 'general') returning id`,
      [`w${i}:n:1`, `w${i}`, `nghĩa ${i}`],
    );
    wordIds.push(r.id);
  }
  await pg.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${U1}', 'a@x.vn', '{"username":"Alice_01"}'),
      ('${U2}', 'b@x.vn', '{}')`);
}, 60000);
afterAll(() => pg.close());

describe("trigger profile", () => {
  it("lấy username từ metadata, hoặc sinh tạm", async () => {
    expect((await one<{ username: string }>(`select username from profiles where id = $1`, [U1])).username).toBe("Alice_01");
    expect((await one<{ username: string }>(`select username from profiles where id = $1`, [U2])).username).toMatch(/^user_[0-9a-f]{8}$/);
  });
  it("username không phân biệt hoa thường", async () => {
    await expect(
      pg.query(`insert into auth.users (email, raw_user_meta_data) values ('c@x.vn', '{"username":"ALICE_01"}')`),
    ).rejects.toThrow(/profiles_username_idx|duplicate/);
  });
});

describe("hit_rate_limit", () => {
  it("cho phép tới giới hạn rồi chặn", async () => {
    const got = [];
    for (let i = 0; i < 5; i++) got.push(await call("hit_rate_limit", "t:1", 3600, 3));
    expect(got).toEqual([true, true, true, false, false]);
    expect(await call("hit_rate_limit", "t:2", 3600, 3)).toBe(true); // key khác độc lập
  });
});

describe("apply_round_result", () => {
  it("ghi tiến độ, bộ đếm, xp, chuỗi ngày, ngữ pháp, Blitz", async () => {
    const id = await newRound();
    const out = (await round(id, U1, {
      today: 100,
      xp: 50,
      updates: [
        { word_id: wordIds[0], level: 1, bad: 0, next_review: "2026-10-24T00:00:00Z" },
        { word_id: wordIds[1], level: 3, bad: 0, next_review: "2026-10-28T00:00:00Z" },
        { word_id: wordIds[1], level: 3, bad: 0, next_review: "2026-10-28T00:00:00Z" }, // trùng: không được làm hỏng
      ],
      grammar: [{ level: "A1", correct: true }, { level: "A1", correct: false }],
      blitz: { key: "blitz:A1", score: 120 },
    })) as { xp: number; streak: number; newBest: boolean; board: { username: string; best: number }[] };

    expect(out).toMatchObject({ xp: 50, streak: 1, newBest: true });
    expect(out.board[0]).toEqual({ username: "Alice_01", best: 120 });

    expect((await one<{ n: number }>(`select count(*)::int n from user_word_progress where user_id = $1`, [U1])).n).toBe(2);
    expect(await one(`select learned, mastered from user_level_stats where user_id = $1 and cefr = 'A1' and domain = 'general'`, [U1]))
      .toEqual({ learned: 2, mastered: 1 });
    expect(await one(`select correct, total from grammar_stats where user_id = $1 and level = 'A1'`, [U1])).toEqual({ correct: 1, total: 2 });
    expect(await one(`select xp::int, xp_today, xp_day, streak, last_day from profiles where id = $1`, [U1]))
      .toEqual({ xp: 50, xp_today: 50, xp_day: 100, streak: 1, last_day: 100 });
  });

  it("nộp lần hai cùng vòng bị từ chối, không ghi trùng", async () => {
    const id = await newRound();
    await round(id, U1, { today: 100, xp: 10 });
    await expect(round(id, U1, { today: 100, xp: 10 })).rejects.toThrow(/round_finished_or_invalid/);
    expect((await one<{ xp: number }>(`select xp::int from profiles where id = $1`, [U1])).xp).toBe(60);
  });

  it("vòng của người khác bị từ chối", async () => {
    const id = await newRound(U2);
    await expect(round(id, U1, { today: 100, xp: 10 })).rejects.toThrow(/round_finished_or_invalid/);
  });

  it("bộ đếm theo chênh lệch; ngày kế tiếp tăng chuỗi, cộng dồn xp_today theo ngày", async () => {
    const id = await newRound();
    const out = (await round(id, U1, {
      today: 101,
      xp: 30,
      updates: [
        { word_id: wordIds[0], level: 3, bad: 0, next_review: "2026-10-28T00:00:00Z" }, // 1 → 3: mastered +1
        { word_id: wordIds[1], level: 0, bad: 0, next_review: "2026-10-24T00:00:00Z" }, // 3 → 0: learned -1, mastered -1
      ],
    })) as { streak: number; xp: number };
    expect(out.streak).toBe(2);
    expect(await one(`select learned, mastered from user_level_stats where user_id = $1`, [U1])).toEqual({ learned: 1, mastered: 1 });
    expect(await one(`select xp_today, xp_day from profiles where id = $1`, [U1])).toEqual({ xp_today: 30, xp_day: 101 });
  });

  it("bỏ lỡ một ngày thì chuỗi về 1, best_streak giữ", async () => {
    const id = await newRound();
    expect(((await round(id, U1, { today: 104, xp: 0 })) as { streak: number }).streak).toBe(1);
    expect((await one<{ best_streak: number }>(`select best_streak from profiles where id = $1`, [U1])).best_streak).toBe(2);
  });

  it("Blitz: điểm thấp hơn không ghi đè, newBest=false", async () => {
    const id = await newRound();
    const out = (await round(id, U1, { today: 104, xp: 0, blitz: { key: "blitz:A1", score: 40 } })) as { newBest: boolean };
    expect(out.newBest).toBe(false);
    expect(await one(`select best, plays from game_scores where user_id = $1 and game = 'blitz:A1'`, [U1])).toEqual({ best: 120, plays: 2 });
  });
});

describe("mark_learned", () => {
  it("đưa từ mới lên level 1 (đến hạn ngay), idempotent, không đụng xp", async () => {
    const xpBefore = (await one<{ xp: number }>(`select xp::int from profiles where id = $1`, [U2])).xp;
    expect(await call("mark_learned", U2, `{${wordIds[3]},${wordIds[4]}}`)).toBe(2);
    expect(await call("mark_learned", U2, `{${wordIds[3]},${wordIds[4]}}`)).toBe(0);
    expect(await one(`select learned, mastered from user_level_stats where user_id = $1`, [U2])).toEqual({ learned: 2, mastered: 0 });
    expect(await one(`select level, bad from user_word_progress where user_id = $1 and word_id = $2`, [U2, wordIds[3]])).toEqual({ level: 1, bad: 0 });
    expect((await one<{ xp: number }>(`select xp::int from profiles where id = $1`, [U2])).xp).toBe(xpBefore);
  });

  it("từ level 0 được đưa lên 1; từ đã level >= 1 giữ nguyên", async () => {
    // U1: wordIds[1] đang level 0, wordIds[0] đang level 3
    expect(await call("mark_learned", U1, `{${wordIds[0]},${wordIds[1]}}`)).toBe(1);
    expect((await one<{ level: number }>(`select level from user_word_progress where user_id = $1 and word_id = $2`, [U1, wordIds[0]])).level).toBe(3);
    expect((await one<{ level: number }>(`select level from user_word_progress where user_id = $1 and word_id = $2`, [U1, wordIds[1]])).level).toBe(1);
  });

  it("quá 50 từ bị từ chối", async () => {
    const ids = `{${Array.from({ length: 51 }, (_, i) => i + 1).join(",")}}`;
    await expect(call("mark_learned", U1, ids)).rejects.toThrow(/too_many_words/);
  });
});

describe("bài thi lên cấp", () => {
  const insertExam = (user: string) =>
    one<{ id: string }>(
      `insert into level_exams (user_id, cefr, items, expires_at) values ($1, 'A1', '[]', now() + interval '20 minutes') returning id`,
      [user],
    );

  it("chỉ một bài đang dở cho mỗi người (cả khi chèn song song)", async () => {
    await insertExam(U1);
    await expect(insertExam(U1)).rejects.toThrow(/level_exams_one_open_idx|duplicate/);
    await insertExam(U2); // người khác vẫn được
  });

  it("đạt: ghi level_passes + chuỗi ngày, KHÔNG đổi xp/SRS/grammar_stats; nộp lại bị từ chối", async () => {
    const before = await one(`select xp::int xp from profiles where id = $1`, [U1]);
    const gs = await one(`select count(*)::int n from grammar_stats where user_id = $1`, [U1]);
    const exam = await one<{ id: string }>(`select id from level_exams where user_id = $1 and finished_at is null`, [U1]);
    const out = await call("apply_exam_result", U1, exam.id, JSON.stringify({ passed: true, total: 0.9, vocab: 0.9, grammar: 0.9, today: 105 }) as unknown as object);
    expect(out).toMatchObject({ passed: true, cefr: "A1", streak: 2 });
    expect(await one(`select cefr, score::float score from level_passes where user_id = $1`, [U1])).toEqual({ cefr: "A1", score: 0.9 });
    expect(await one(`select xp::int xp from profiles where id = $1`, [U1])).toEqual(before);
    expect(await one(`select count(*)::int n from grammar_stats where user_id = $1`, [U1])).toEqual(gs);
    await expect(
      call("apply_exam_result", U1, exam.id, JSON.stringify({ passed: true, total: 1, vocab: 1, grammar: 1, today: 105 }) as unknown as object),
    ).rejects.toThrow(/exam_finished_or_invalid/);
    await insertExam(U1); // đã kết thúc bài trước → mở được bài mới
  });

  it("trượt: không có level_passes; fail_exam đóng bài hết giờ với điểm 0", async () => {
    const exam = await one<{ id: string }>(`select id from level_exams where user_id = $1 and finished_at is null`, [U2]);
    await call("apply_exam_result", U2, exam.id, JSON.stringify({ passed: false, total: 0.5, vocab: 0.5, grammar: 0.5, today: 105 }) as unknown as object);
    expect((await one<{ n: number }>(`select count(*)::int n from level_passes where user_id = $1`, [U2])).n).toBe(0);
    const e2 = await insertExam(U2);
    expect(await call("fail_exam", U2, e2.id)).toBe(true);
    expect(await call("fail_exam", U2, e2.id)).toBe(false);
    expect(await one(`select passed, score_total::float s from level_exams where id = $1`, [e2.id])).toEqual({ passed: false, s: 0 });
  });
});

describe("RLS và quyền", () => {
  const asUser = async (user: string) => {
    await pg.exec(`reset role`);
    await pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
    await pg.exec(`set role authenticated`);
  };
  afterAll(() => pg.exec(`reset role`));

  it("người dùng chỉ đọc dòng của chính mình", async () => {
    await asUser(U1);
    const rows = (await pg.query<{ user_id: string }>(`select user_id from user_word_progress`)).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.user_id))).toEqual(new Set([U1]));
    expect((await pg.query(`select id from profiles`)).rows).toHaveLength(1);
  });

  it("không đọc được bảng chứa đáp án / nội bộ", async () => {
    await asUser(U1);
    for (const t of ["level_exams", "game_rounds", "grammar_questions", "rate_limits", "content_imports"]) {
      await expect(pg.query(`select * from ${t}`), t).rejects.toThrow(/permission denied/);
    }
  });

  it("không ghi được bảng nào và không gọi được hàm ghi", async () => {
    await asUser(U1);
    await expect(pg.query(`update profiles set xp = 999999`)).rejects.toThrow(/permission denied/);
    await expect(pg.query(`insert into level_passes (user_id, cefr) values ($1, 'C1')`, [U1])).rejects.toThrow(/permission denied/);
    await expect(pg.query(`select hit_rate_limit('x', 60, 5)`)).rejects.toThrow(/permission denied/);
    await expect(pg.query(`select mark_learned($1, '{1}')`, [U1])).rejects.toThrow(/permission denied/);
  });

  it("đọc được nội dung đang active", async () => {
    await asUser(U1);
    expect((await pg.query(`select id from words`)).rows.length).toBe(5);
  });
});
