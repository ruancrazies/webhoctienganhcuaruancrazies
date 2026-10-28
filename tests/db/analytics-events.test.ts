import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./helpers";

/** Giai đoạn 0 (migration 0012): ba RPC nộp bài ghi answer_events + answers CÙNG GIAO DỊCH với điểm. */

let pg: PGlite;
const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
let w1: number, w2: number, w3: number, g1: number, pass1: number, pq1: number;

const one = async <T extends object>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows[0];
const all = async <T extends object>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows;

const newRound = async (user = U1) => (await one<{ id: string }>(`insert into game_rounds (user_id, game, items) values ($1, 'quiz', '[]') returning id`, [user])).id;
const newExam = async (user = U1) =>
  (await one<{ id: string }>(`insert into level_exams (user_id, cefr, items, expires_at) values ($1, 'A1', '[]', now() + interval '30 minutes') returning id`, [user])).id;
const newTest = async (user = U1) =>
  (await one<{ id: string }>(`insert into practice_tests (user_id, items, expires_at) values ($1, '[]', now() + interval '30 minutes') returning id`, [user])).id;

const applyRound = (user: string, id: string, payload: object) =>
  pg.query(`select apply_round_result($1, $2, $3::jsonb) as r`, [user, id, JSON.stringify({ today: 20000, xp: 0, updates: [], grammar: [], blitz: null, ...payload })]);
const applyExam = (user: string, id: string, payload: object) =>
  pg.query(`select apply_exam_result($1, $2, $3::jsonb) as r`, [user, id, JSON.stringify({ passed: false, total: 0.5, vocab: 0.5, grammar: 0.5, today: 20000, ...payload })]);
const applyTest = (user: string, id: string, payload: object) =>
  pg.query(`select apply_practice_result($1, $2, $3::jsonb) as r`, [user, id, JSON.stringify({ total: 0.5, vocab: 0.5, grammar: 0.5, today: 20000, wrongWords: [], ...payload })]);

const ev = (qid: string, extra: object = {}) => ({ qid, game: "quiz", part: "vocab", correct: true, ...extra });
const eventsOf = (source: string, id: string) =>
  all<Record<string, unknown>>(`select * from answer_events where source = $1 and source_id = $2 order by id`, [source, id]);
const count = async (sql: string, params: unknown[] = []) => Number((await one<{ c: string }>(sql, params)).c);

beforeAll(async () => {
  ({ pg } = await freshDb());
  await pg.exec(`insert into domains (code, title) values ('general', 'Chung'), ('travel', 'Du lịch')`);
  const mk = async (key: string, pos: string, cefr: string, domain: string) =>
    (await one<{ id: number }>(`insert into words (key, en, pos, vi, cefr, domain) values ($1, $1, $2, 'nghĩa', $3, $4) returning id`, [key, pos, cefr, domain])).id;
  w1 = await mk("apple", "n", "A1", "general");
  w2 = await mk("book", "v", "B1", "travel");
  w3 = await mk("cat", "n", "A1", "general");
  g1 = (await one<{ id: number }>(`insert into grammar_questions (key, level, topic, question, options, answer) values ('g1', 'A2', 'tenses', 'She ___ home.', '["go","goes"]', 2) returning id`)).id;
  pass1 = (await one<{ id: number }>(`insert into passages (key, skill, level, title, body) values ('p1', 'reading', 'B1', 'T', 'Body') returning id`)).id;
  pq1 = (await one<{ id: number }>(`insert into passage_questions (key, passage_id, kind, question, options, answer, sort) values ('pq1', $1, 'tf', 'Q?', '[]', 1, 1) returning id`, [pass1])).id;
  await pg.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${U1}', 'a@x.vn', '{"username":"Alice_01"}'), ('${U2}', 'b@x.vn', '{"username":"Bob_02"}')`);
}, 60000);
afterAll(() => pg.close());

describe("apply_round_result ghi answer_events", () => {
  it("mỗi câu một dòng; nhãn cefr/domain/pos lấy từ bảng words, chủ đề ngữ pháp từ grammar_questions", async () => {
    const id = await newRound();
    await applyRound(U1, id, {
      events: [
        ev("q1", { word_id: w1, answer_value: "quả táo", expected: "quả táo", attempts: 1, response_ms: 2100 }),
        ev("q2", { game: "type", word_id: w2, correct: false, near: false, answer_value: "bok", expected: "book", hint_used: false }),
        ev("q3", { game: "tf", part: "grammar", grammar_id: g1, correct: true, answer_value: "true", expected: "true" }),
      ],
    });
    const rows = await eventsOf("round", id);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ user_id: U1, source: "round", qid: "q1", game: "quiz", part: "vocab", word_id: w1, cefr: "A1", domain: "general", pos: "n",
      correct: true, near: false, attempts: 1, answer_value: "quả táo", expected: "quả táo", response_ms: 2100, grammar_topic: null });
    expect(rows[1]).toMatchObject({ word_id: w2, cefr: "B1", domain: "travel", pos: "v", correct: false, answer_value: "bok", expected: "book", response_ms: null });
    expect(rows[2]).toMatchObject({ part: "grammar", grammar_id: g1, cefr: "A2", grammar_topic: "tenses", domain: null, pos: null });
    expect(rows[0].answered_at).toBeInstanceOf(Date);
  });

  it("nộp hai lần: lần hai bị từ chối và KHÔNG ghi thêm dòng nào", async () => {
    const id = await newRound();
    await applyRound(U1, id, { events: [ev("q1", { word_id: w1 }), ev("q2", { word_id: w2 })] });
    await expect(applyRound(U1, id, { events: [ev("q1", { word_id: w1 }), ev("q2", { word_id: w2 })] })).rejects.toThrow(/round_finished_or_invalid/);
    expect(await eventsOf("round", id)).toHaveLength(2);
  });

  it("vòng của người khác: bị từ chối, không ghi sự kiện cho ai", async () => {
    const id = await newRound(U1);
    await expect(applyRound(U2, id, { events: [ev("q1", { word_id: w1 })] })).rejects.toThrow(/round_finished_or_invalid/);
    expect(await eventsOf("round", id)).toHaveLength(0);
  });

  it("payload cũ (không có events), events null hoặc rỗng: chạy bình thường, không ghi gì", async () => {
    for (const events of [undefined, null, [], "oops"]) {
      const id = await newRound();
      await expect(applyRound(U1, id, events === undefined ? {} : { events })).resolves.toBeDefined();
      expect(await eventsOf("round", id)).toHaveLength(0);
    }
  });

  it("response_ms ngoài khoảng được kẹp về 0–120.000; đáp án quá dài bị cắt 200 ký tự", async () => {
    const id = await newRound();
    await applyRound(U1, id, {
      events: [ev("q1", { word_id: w1, response_ms: 9_999_999, answer_value: "x".repeat(500) }), ev("q2", { word_id: w2, response_ms: -5 })],
    });
    const [a, b] = await eventsOf("round", id);
    expect(a.response_ms).toBe(120000);
    expect((a.answer_value as string).length).toBe(200);
    expect(b.response_ms).toBe(0);
  });

  it("từ không tồn tại: vẫn ghi sự kiện, nhãn để trống (không làm hỏng nộp bài)", async () => {
    const id = await newRound();
    await applyRound(U1, id, { events: [ev("q1", { word_id: 999999 })] });
    expect((await eventsOf("round", id))[0]).toMatchObject({ word_id: 999999, cefr: null, domain: null, pos: null });
  });

  it("sự kiện ghi cùng giao dịch: tiến độ SRS, XP vẫn đúng như trước", async () => {
    const id = await newRound();
    const r = await applyRound(U1, id, {
      xp: 30,
      updates: [{ word_id: w3, level: 1, bad: 0, next_review: new Date().toISOString() }],
      events: [ev("q1", { word_id: w3 })],
    });
    expect((r.rows[0] as { r: { xp: number } }).r.xp).toBeGreaterThanOrEqual(30);
    expect(await count(`select count(*)::text c from user_word_progress where user_id = $1 and word_id = $2`, [U1, w3])).toBe(1);
    expect(await eventsOf("round", id)).toHaveLength(1);
  });
});

describe("apply_exam_result ghi answers + answer_events", () => {
  it("lưu đáp án đã chọn (kể cả câu bỏ trống) và sự kiện của mọi câu, có nhãn bài đọc", async () => {
    const id = await newExam();
    await applyExam(U1, id, {
      answers: [
        { qid: "q1", value: "quả táo", correct: true, near: false },
        { qid: "q2", value: "", correct: false, near: false },
        { qid: "q3", value: "true", correct: true, near: false },
      ],
      events: [
        ev("q1", { word_id: w1, response_ms: 3000 }),
        ev("q2", { game: "grammar", part: "grammar", grammar_id: g1, correct: false, answer_value: "", expected: "goes" }),
        ev("q3", { game: "passage", part: "reading", passage_id: pass1, passage_question_id: pq1, answer_value: "true", expected: "true" }),
      ],
    });
    const exam = await one<{ answers: unknown; finished_at: Date | null }>(`select answers, finished_at from level_exams where id = $1`, [id]);
    expect(exam.finished_at).not.toBeNull();
    expect(exam.answers).toEqual([
      { qid: "q1", value: "quả táo", correct: true, near: false },
      { qid: "q2", value: "", correct: false, near: false },
      { qid: "q3", value: "true", correct: true, near: false },
    ]);
    const rows = await eventsOf("exam", id);
    expect(rows.map((r) => r.qid)).toEqual(["q1", "q2", "q3"]);
    expect(rows[1]).toMatchObject({ correct: false, answer_value: "", expected: "goes", grammar_topic: "tenses", cefr: "A2" });
    expect(rows[2]).toMatchObject({ part: "reading", passage_id: pass1, passage_question_id: pq1, cefr: "B1" });
  });

  it("nộp hai lần: không ghi trùng; answers giữ nguyên bản đầu", async () => {
    const id = await newExam();
    const first = { answers: [{ qid: "q1", value: "a", correct: true, near: false }], events: [ev("q1", { word_id: w1 })] };
    await applyExam(U1, id, first);
    await expect(applyExam(U1, id, { answers: [{ qid: "q1", value: "KHÁC", correct: false, near: false }], events: [ev("q1", { word_id: w1 }), ev("q2", { word_id: w2 })] })).rejects.toThrow(/exam_finished_or_invalid/);
    expect(await eventsOf("exam", id)).toHaveLength(1);
    expect((await one<{ answers: { value: string }[] }>(`select answers from level_exams where id = $1`, [id])).answers[0].value).toBe("a");
  });

  it("payload cũ không có answers/events: answers = NULL, điểm và level_passes vẫn ghi", async () => {
    const id = await newExam();
    await applyExam(U1, id, { passed: true, total: 0.9 });
    expect((await one<{ answers: unknown }>(`select answers from level_exams where id = $1`, [id])).answers).toBeNull();
    expect(await count(`select count(*)::text c from level_passes where exam_id = $1`, [id])).toBe(1);
    expect(await eventsOf("exam", id)).toHaveLength(0);
  });

  it("bài hết giờ (fail_exam) không có answers và không có sự kiện", async () => {
    const id = await newExam(U2);
    await pg.query(`select fail_exam($1, $2)`, [U2, id]);
    expect((await one<{ answers: unknown }>(`select answers from level_exams where id = $1`, [id])).answers).toBeNull();
    expect(await eventsOf("exam", id)).toHaveLength(0);
  });
});

describe("apply_practice_result ghi answers + answer_events", () => {
  it("lưu đáp án + sự kiện, vẫn hẹn ôn lại từ sai như cũ", async () => {
    await pg.query(`insert into user_word_progress (user_id, word_id, cefr, domain, level, next_review) values ($1, $2, 'A1', 'general', 3, now() + interval '5 days')`, [U1, w1]);
    const id = await newTest();
    await applyTest(U1, id, {
      wrongWords: [w1],
      answers: [{ qid: "q1", value: "sai", correct: false, near: false }, { qid: "q2", value: "", correct: false, near: false }],
      events: [ev("q1", { word_id: w1, correct: false, answer_value: "sai", expected: "đúng" }), ev("q2", { word_id: w2, correct: false })],
    });
    expect((await one<{ answers: unknown[] }>(`select answers from practice_tests where id = $1`, [id])).answers).toHaveLength(2);
    const rows = await eventsOf("practice", id);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ source: "practice", word_id: w1, correct: false, answer_value: "sai", expected: "đúng" });
    const nr = (await one<{ nr: Date }>(`select next_review nr from user_word_progress where user_id = $1 and word_id = $2`, [U1, w1])).nr;
    expect(nr.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("nộp hai lần: không ghi trùng", async () => {
    const id = await newTest();
    await applyTest(U1, id, { events: [ev("q1", { word_id: w1 })] });
    await expect(applyTest(U1, id, { events: [ev("q1", { word_id: w1 })] })).rejects.toThrow(/test_finished_or_invalid/);
    expect(await eventsOf("practice", id)).toHaveLength(1);
  });
});

describe("chốt chặn ở tầng bảng", () => {
  it("record_answer_events gọi lại cùng (source, source_id, qid): bỏ qua, không lỗi, không trùng", async () => {
    const id = await newRound(U2);
    const events = JSON.stringify([ev("q1", { word_id: w1 }), ev("q2", { word_id: w2 })]);
    const a = await one<{ n: number }>(`select record_answer_events($1, 'round', $2, $3::jsonb) as n`, [U2, id, events]);
    const b = await one<{ n: number }>(`select record_answer_events($1, 'round', $2, $3::jsonb) as n`, [U2, id, events]);
    expect([a.n, b.n]).toEqual([2, 0]);
  });

  it("CHECK: source, part và response_ms sai bị bảng từ chối khi ghi thẳng", async () => {
    const base = `insert into answer_events (user_id, source, source_id, qid, game, part, correct, response_ms) values ($1, $2, gen_random_uuid(), 'q1', 'quiz', $3, true, $4)`;
    await expect(pg.query(base, [U1, "round", "vocab", 130000])).rejects.toThrow();
    await expect(pg.query(base, [U1, "round", "vocab", -1])).rejects.toThrow();
    await expect(pg.query(base, [U1, "khac", "vocab", 100])).rejects.toThrow();
    await expect(pg.query(base, [U1, "round", "speaking", 100])).rejects.toThrow();
    await expect(pg.query(base, [U1, "round", "vocab", 120000])).resolves.toBeDefined();
  });

  it("xóa tài khoản xóa luôn sự kiện (on delete cascade)", async () => {
    const U3 = "33333333-3333-3333-3333-333333333333";
    await pg.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${U3}', 'c@x.vn', '{"username":"Cara_03"}')`);
    const id = await newRound(U3);
    await applyRound(U3, id, { events: [ev("q1", { word_id: w1 })] });
    expect(await count(`select count(*)::text c from answer_events where user_id = $1`, [U3])).toBe(1);
    await pg.exec(`delete from auth.users where id = '${U3}'`);
    expect(await count(`select count(*)::text c from answer_events where user_id = $1`, [U3])).toBe(0);
  });
});

describe("quyền và RLS", () => {
  const tables = ["answer_events", "activity_events", "user_insights"];

  it("bảng mới bật RLS; anon/authenticated không có quyền nào; service_role có đủ", async () => {
    for (const t of tables) {
      const r = await one<{ rls: boolean; anon: boolean; auth: boolean; svc: boolean }>(
        `select c.relrowsecurity rls,
                has_table_privilege('anon', c.oid, 'select') anon,
                has_table_privilege('authenticated', c.oid, 'select') auth,
                has_table_privilege('service_role', c.oid, 'insert') svc
           from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = $1`, [t]);
      expect(r, t).toEqual({ rls: true, anon: false, auth: false, svc: true });
    }
  });

  it("record_answer_events và ba RPC nộp bài chỉ service_role gọi được", async () => {
    for (const fn of ["record_answer_events(uuid,text,uuid,jsonb)", "apply_round_result(uuid,uuid,jsonb)", "apply_exam_result(uuid,uuid,jsonb)", "apply_practice_result(uuid,uuid,jsonb)"]) {
      const r = await one<{ a: boolean; b: boolean; c: boolean }>(
        `select has_function_privilege('anon', 'public.${fn}', 'execute') a, has_function_privilege('authenticated', 'public.${fn}', 'execute') b, has_function_privilege('service_role', 'public.${fn}', 'execute') c`);
      expect(r, fn).toEqual({ a: false, b: false, c: true });
    }
  });

  it("cột answers của bài thi/kiểm tra không lộ cho authenticated (bảng đã khóa từ trước)", async () => {
    for (const t of ["level_exams", "practice_tests"]) {
      const r = await one<{ ok: boolean }>(`select has_table_privilege('authenticated', 'public.${t}', 'select') ok`);
      expect(r.ok, t).toBe(false);
    }
  });
});
