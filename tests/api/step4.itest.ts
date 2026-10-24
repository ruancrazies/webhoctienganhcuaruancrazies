/**
 * Nghiệm thu Bước 4 (mục 7 của tài liệu kiến trúc) — test tích hợp chạy qua ĐÚNG Route Handler,
 * service, repo và Postgres/PostgREST thật (Supabase local). Chỉ giả lập phiên đăng nhập và đồng hồ (Date).
 *
 * Chạy:  npx supabase start   →   npm run test:api
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { makePool, requireLocalEnv } from "./helpers";

// ---- giả lập phiên (requireUserId) --------------------------------------------------------------
const state = vi.hoisted(() => ({ user: null as string | null }));
vi.mock("../../src/server/auth/session", () => {
  class UnauthorizedError extends Error {}
  return {
    UnauthorizedError,
    requireUserId: async () => {
      if (!state.user) throw new UnauthorizedError();
      return state.user;
    },
  };
});

import { POST as playStart } from "../../src/app/api/play/start/route";
import { POST as playFinish } from "../../src/app/api/play/finish/route";
import { POST as examStart } from "../../src/app/api/exam/start/route";
import { POST as examSubmit } from "../../src/app/api/exam/submit/route";
import { POST as learnMark } from "../../src/app/api/learn/mark/route";
import { GET as learnWords } from "../../src/app/api/learn/words/route";
import { GET as home } from "../../src/app/api/home/route";
import { GET as leaderboard } from "../../src/app/api/leaderboard/route";
import { setConfigForTest } from "../../src/server/config";
import { clearLeaderboardCache } from "../../src/server/services";

// ---- hạ tầng test -------------------------------------------------------------------------------
type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
let pool: Pool;
const users: string[] = [];
const realNow = Date.now.bind(Date); // lấy trước khi giả Date

/** Đặt đồng hồ JS = giờ thật + sec (DB vẫn chạy giờ thật). */
const at = (sec = 0) => vi.setSystemTime(realNow() + sec * 1000);

const q = async <T = Json>(sql: string, params: unknown[] = []): Promise<T[]> => (await pool.query(sql, params)).rows as T[];

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const get = (url: string) => new Request(`http://localhost${url}`);

async function call(handler: (r: Request) => Promise<Response>, req: Request, sec = 0): Promise<{ status: number; body: Json }> {
  at(sec);
  const res = await handler(req);
  return { status: res.status, body: await res.json() };
}

async function newUser(): Promise<string> {
  const id = randomUUID();
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${id}@itest.local`, JSON.stringify({ username: `it_${id.slice(0, 8)}` })]);
  users.push(id);
  state.user = id;
  return id;
}

type Item = { qid: string; expected: string | string[]; wordId?: number };
const correct = (items: Item[]) => items.map((i) => ({ qid: i.qid, value: i.expected }));
const wrong = (items: Item[]) => items.map((i) => ({ qid: i.qid, value: "sai hoàn toàn" }));
const storedRound = async (id: string): Promise<Item[]> => (await q(`select items from game_rounds where id = $1`, [id]))[0].items.items;
const storedExam = async (id: string): Promise<Item[]> => (await q(`select items from level_exams where id = $1`, [id]))[0].items;

const A1_WORDS = 35; // > 30 để thử phân trang
const A2_WORDS = 5;

async function seedContent() {
  const dirty = await q(`select count(*)::int n from words where key not like 'itest:%'`);
  if (dirty[0].n > 0) {
    throw new Error("DB local đang có nội dung thật — test cần DB sạch để số liệu xác định. Chạy `npx supabase db reset` rồi thử lại.");
  }
  await q(`insert into domains (code, title) values ('general', 'Chung') on conflict do nothing`);
  const mk = async (cefr: string, n: number, base: number) => {
    for (let i = 1; i <= n; i++) {
      const k = base + i;
      const w = await q<{ id: number }>(
        `insert into words (key, en, pos, vi, cefr, domain, freq_rank) values ($1, $2, 'n', $3, $4, 'general', $5) returning id`,
        [`itest:w${k}:n:1`, `itestword${k}`, `nghĩa kiểm thử ${k}`, cefr, k],
      );
      const s = await q<{ id: number }>(`insert into sentences (key, en, vi, cefr, kind) values ($1, $2, $3, $4, 'statement') returning id`, [
        `itest:s${k}`, `I really like itestword${k} a lot.`, `Tôi rất thích ${k}.`, cefr,
      ]);
      await q(`insert into sentence_words (word_id, sentence_id) values ($1, $2)`, [w[0].id, s[0].id]);
    }
  };
  await mk("A1", A1_WORDS, 0);
  await mk("A2", A2_WORDS, 1000);
  for (const lv of ["A1", "A2"]) {
    for (let i = 1; i <= 12; i++) {
      await q(`insert into grammar_questions (key, level, topic, question, options, answer, explanation) values ($1, $2, 't', $3, $4, 1, 'giải thích')`, [
        `itest:g${lv}${i}`, lv, `Câu ngữ pháp ${lv} số ${i} ___ .`, JSON.stringify(["đáp án đúng", "sai một", "sai hai"]),
      ]);
    }
  }
  await q(`select refresh_content_stats()`);
}

async function cleanup() {
  if (users.length) {
    await q(`delete from rate_limits where right(key, 36) = any($1)`, [users]);
    await q(`delete from auth.users where id = any($1)`, [users]);
  }
  await q(`delete from sentence_words where word_id in (select id from words where key like 'itest:%')`);
  await q(`delete from sentences where key like 'itest:%'`);
  await q(`delete from grammar_questions where key like 'itest:%'`);
  await q(`delete from words where key like 'itest:%'`);
  await q(`select refresh_content_stats()`);
}

beforeAll(async () => {
  const { dbUrl } = requireLocalEnv();
  pool = makePool(dbUrl);
  await q(`delete from auth.users where email like '%@itest.local'`); // dọn lần chạy hỏng trước
  await q(`delete from sentence_words where word_id in (select id from words where key like 'itest:%')`);
  await q(`delete from sentences where key like 'itest:%'`);
  await q(`delete from grammar_questions where key like 'itest:%'`);
  await q(`delete from words where key like 'itest:%'`);
  await seedContent();
  vi.useFakeTimers({ toFake: ["Date"] });
  setConfigForTest({
    levels: { examMinWords: { A1: 10, A2: 20, B1: 30, B2: 40, C1: 50 } },
    exam: {
      vocab: { total: 8, mix: { quiz: 8, cloze: 0, type: 0 } },
      grammar: { total: 4 },
      durationMinutes: 20,
      passTotal: 0.8,
      passPart: 0.7,
      cooldownMinutes: 60,
      maxAttemptsPerDay: 3,
    },
  });
}, 120_000);

afterAll(async () => {
  vi.useRealTimers();
  setConfigForTest(undefined);
  try {
    await cleanup();
  } finally {
    await pool.end();
  }
});

/** Cho người dùng học `n` từ A1 đầu tiên (qua API thật). */
async function learnA1(n: number) {
  const ids = (await q<{ id: string }>(`select id from words where key like 'itest:w%' and cefr = 'A1' order by freq_rank limit $1`, [n])).map((r) => Number(r.id));
  for (let i = 0; i < ids.length; i += 50) {
    const r = await call(learnMark, post("/api/learn/mark", { wordIds: ids.slice(i, i + 50) }));
    expect(r.status).toBe(200);
  }
  return ids;
}

// ==================================================================================================
describe("khung HTTP", () => {
  it("chưa đăng nhập → 401", async () => {
    state.user = null;
    const r = await call(playStart, post("/api/play/start", { game: "quiz", scope: { by: "level", cefr: "A1" } }));
    expect(r.status).toBe(401);
    expect(r.body.code).toBe("UNAUTHORIZED");
  });

  it("POST từ trang web khác (Origin lệch) → 403", async () => {
    await newUser();
    const r = await call(
      playStart,
      post("/api/play/start", { game: "quiz", scope: { by: "level", cefr: "A1" } }, { origin: "https://evil.example", host: "localhost" }),
    );
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("BAD_ORIGIN");
  });

  it("dữ liệu sai → 400 (Zod); JSON hỏng → 400", async () => {
    await newUser();
    expect((await call(playStart, post("/api/play/start", { game: "khong-co", scope: { by: "level", cefr: "A1" } }))).status).toBe(400);
    const bad = new Request("http://localhost/api/play/start", { method: "POST", body: "{không phải json" });
    const r = await call(playStart, bad);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("BAD_JSON");
  });
});

// ==================================================================================================
describe("vòng chơi: play/start + play/finish", () => {
  it("start trả câu hỏi KHÔNG có đáp án; đáp án nằm ở DB", async () => {
    await newUser();
    const r = await call(playStart, post("/api/play/start", { game: "quiz", scope: { by: "level", cefr: "A1" }, n: 10 }));
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(10);
    expect(JSON.stringify(r.body)).not.toContain("expected");
    const stored = await storedRound(r.body.roundId);
    expect(stored).toHaveLength(10);
    expect(stored.every((i) => i.expected !== undefined)).toBe(true);
  });

  it("cấp chưa mở → 403 LEVEL_LOCKED; blitz theo chủ đề → 400", async () => {
    await newUser();
    const locked = await call(playStart, post("/api/play/start", { game: "quiz", scope: { by: "level", cefr: "A2" } }));
    expect(locked.status).toBe(403);
    expect(locked.body.code).toBe("LEVEL_LOCKED");
    const lv = await call(playStart, post("/api/play/start", { game: "blitz", scope: { by: "topic", topicSlug: "bat-ky" } }));
    expect(lv.status).toBe(400);
    expect(lv.body.code).toBe("LEVEL_ONLY");
  });

  it("đáp án giả bị từ chối: vòng/qid không tồn tại, vòng của người khác", async () => {
    const a = await newUser();
    const start = await call(playStart, post("/api/play/start", { game: "quiz", scope: { by: "level", cefr: "A1" }, n: 5 }));
    const items = await storedRound(start.body.roundId);

    // vòng không tồn tại
    const none = await call(playFinish, post("/api/play/finish", { roundId: randomUUID(), answers: correct(items) }), 60);
    expect(none.status).toBe(409);
    expect(none.body.code).toBe("ROUND_INVALID");

    // qid bịa → không câu nào hợp lệ
    const fake = await call(playFinish, post("/api/play/finish", { roundId: start.body.roundId, answers: [{ qid: "zzz", value: "x" }] }), 60);
    expect(fake.status).toBe(400);
    expect(fake.body.code).toBe("NO_ANSWERS");

    // người khác nộp vòng của A
    await newUser();
    const other = await call(playFinish, post("/api/play/finish", { roundId: start.body.roundId, answers: correct(items) }), 60);
    expect(other.status).toBe(409);
    expect(other.body.code).toBe("ROUND_INVALID");

    // vòng của A vẫn nguyên (chưa bị đóng)
    expect((await q(`select finished_at from game_rounds where id = $1`, [start.body.roundId]))[0].finished_at).toBeNull();
    expect(a).toBeTruthy();
  });

  it("trả lời sai hết → 0 XP, không lên level, review đủ câu", async () => {
    const u = await newUser();
    const start = await call(playStart, post("/api/play/start", { game: "quiz", scope: { by: "level", cefr: "A1" }, n: 10 }));
    const items = await storedRound(start.body.roundId);
    const r = await call(playFinish, post("/api/play/finish", { roundId: start.body.roundId, answers: wrong(items) }), 60);
    expect(r.status).toBe(200);
    expect(r.body.xpGained).toBe(0);
    expect(r.body.review).toHaveLength(10);
    const lv = await q(`select count(*)::int n from user_word_progress where user_id = $1 and level >= 1`, [u]);
    expect(lv[0].n).toBe(0);
  });

  it("nộp quá nhanh → 429 TOO_FAST (vòng chưa bị đóng, nộp lại đúng giờ thì được)", async () => {
    await newUser();
    const start = await call(playStart, post("/api/play/start", { game: "quiz", scope: { by: "level", cefr: "A1" }, n: 10 }));
    const items = await storedRound(start.body.roundId);
    const fast = await call(playFinish, post("/api/play/finish", { roundId: start.body.roundId, answers: correct(items) }), 0);
    expect(fast.status).toBe(429);
    expect(fast.body.code).toBe("TOO_FAST");
    const ok = await call(playFinish, post("/api/play/finish", { roundId: start.body.roundId, answers: correct(items) }), 60);
    expect(ok.status).toBe(200);
  });

  it("nộp hai lần bị chặn (tuần tự) và XP chỉ cộng một lần", async () => {
    const u = await newUser();
    const start = await call(playStart, post("/api/play/start", { game: "quiz", scope: { by: "level", cefr: "A1" }, n: 10 }));
    const items = await storedRound(start.body.roundId);
    const body = { roundId: start.body.roundId, answers: correct(items) };
    const first = await call(playFinish, post("/api/play/finish", body), 60);
    expect(first.status).toBe(200);
    expect(first.body.xpGained).toBeGreaterThan(0);
    const second = await call(playFinish, post("/api/play/finish", body), 61);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("ROUND_INVALID");
    expect(Number((await q(`select xp from profiles where id = $1`, [u]))[0].xp)).toBe(first.body.xpGained);
  });

  it("nộp hai lần SONG SONG: đúng một request thành công", async () => {
    const u = await newUser();
    const start = await call(playStart, post("/api/play/start", { game: "quiz", scope: { by: "level", cefr: "A1" }, n: 10 }));
    const items = await storedRound(start.body.roundId);
    at(60);
    const mk = () => playFinish(post("/api/play/finish", { roundId: start.body.roundId, answers: correct(items) }));
    const res = await Promise.all([mk(), mk(), mk()]);
    const statuses = res.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409, 409]);
    const ok = await res.find((r) => r.status === 200)!.json();
    expect(Number((await q(`select xp from profiles where id = $1`, [u]))[0].xp)).toBe(ok.xpGained);
  });

  it("đúng 3 lần liên tiếp → \"thuộc\" (level 3), bộ đếm và trang Học khớp", async () => {
    const u = await newUser();
    const seen: Map<number, number> = new Map();
    for (let round = 0; round < 3; round++) {
      const base = round * 200;
      const start = await call(playStart, post("/api/play/start", { game: "quiz", scope: { by: "level", cefr: "A1" }, n: 10 }), base);
      expect(start.status).toBe(200);
      const items = await storedRound(start.body.roundId);
      for (const it of items) if (it.wordId) seen.set(it.wordId, (seen.get(it.wordId) ?? 0) + 1);
      const fin = await call(playFinish, post("/api/play/finish", { roundId: start.body.roundId, answers: correct(items) }), base + 100);
      expect(fin.status).toBe(200);
    }
    const inAll3 = [...seen].filter(([, n]) => n === 3).map(([id]) => id);
    expect(inAll3.length).toBeGreaterThan(0); // từ chưa thuộc được ưu tiên ôn lại → phải lặp lại qua các vòng
    const rows = await q<{ word_id: number; level: number }>(`select word_id::int, level from user_word_progress where user_id = $1 and word_id = any($2)`, [u, inAll3]);
    expect(rows.every((r) => r.level >= 3)).toBe(true);
    const stat = await q(`select mastered from user_level_stats where user_id = $1 and cefr = 'A1' and domain = 'general'`, [u]);
    expect(stat[0].mastered).toBe(inAll3.length);
    const page = await call(learnWords, get("/api/learn/words?cefr=A1"), 700);
    const mastered = page.body.items.filter((c: Json) => c.state === "mastered").map((c: Json) => c.wordId);
    for (const id of inAll3.filter((id) => page.body.items.some((c: Json) => c.wordId === id))) expect(mastered).toContain(id);
  });

  it("Blitz: điểm do server tính, bảng xếp hạng theo cấp của vòng", async () => {
    await newUser();
    const start = await call(playStart, post("/api/play/start", { game: "blitz", scope: { by: "level", cefr: "A1" }, n: 20 }));
    expect(start.status).toBe(200);
    const items = await storedRound(start.body.roundId);
    const fin = await call(playFinish, post("/api/play/finish", { roundId: start.body.roundId, answers: correct(items), level: "C1" }), 60);
    expect(fin.status).toBe(200);
    expect(fin.body.newBest).toBe(true);
    clearLeaderboardCache();
    const board = await call(leaderboard, get("/api/leaderboard?blitz=A1"));
    expect(board.status).toBe(200);
    expect(JSON.stringify(board.body)).toContain("it_");
    const wrongLevel = await call(leaderboard, get("/api/leaderboard?blitz=C1"));
    expect(JSON.stringify(wrongLevel.body)).not.toContain(state.user!.slice(0, 8)); // `level: "C1"` của client bị bỏ qua
  });
});

// ==================================================================================================
describe("học: learn/words + learn/mark", () => {
  it("phân trang keyset 30 từ/trang, không trùng, hết thì không còn con trỏ", async () => {
    await newUser();
    const p1 = await call(learnWords, get("/api/learn/words?cefr=A1"));
    expect(p1.status).toBe(200);
    expect(p1.body.items).toHaveLength(30);
    expect(p1.body.nextCursor).toMatch(/^\d+:\d+$/);
    expect(p1.body.items[0].examples.length).toBeGreaterThan(0);
    const p2 = await call(learnWords, get(`/api/learn/words?cefr=A1&cursor=${p1.body.nextCursor}`));
    expect(p2.body.items).toHaveLength(A1_WORDS - 30);
    expect(p2.body.nextCursor).toBeUndefined();
    const ids = [...p1.body.items, ...p2.body.items].map((c: Json) => c.wordId);
    expect(new Set(ids).size).toBe(A1_WORDS);
    expect((await call(learnWords, get("/api/learn/words?cefr=A1&cursor=abc"))).status).toBe(400);
  });

  it("học cấp khóa → 403; đánh dấu: lần đầu tính, lần hai không", async () => {
    await newUser();
    expect((await call(learnWords, get("/api/learn/words?cefr=A2"))).status).toBe(403);
    const a2 = await q<{ id: number }>(`select id from words where cefr = 'A2' and key like 'itest:%' limit 1`);
    const lockedMark = await call(learnMark, post("/api/learn/mark", { wordIds: [Number(a2[0].id)] }));
    expect(lockedMark.status).toBe(403);
    expect(lockedMark.body.code).toBe("LEVEL_LOCKED");

    const a1 = (await q<{ id: string }>(`select id from words where cefr = 'A1' and key like 'itest:%' limit 5`)).map((r) => Number(r.id));
    expect((await call(learnMark, post("/api/learn/mark", { wordIds: a1 }))).body).toEqual({ marked: 5 });
    expect((await call(learnMark, post("/api/learn/mark", { wordIds: a1 }))).body).toEqual({ marked: 0 });
    expect((await call(learnMark, post("/api/learn/mark", { wordIds: [999999999] }))).status).toBe(404);
    expect((await call(learnMark, post("/api/learn/mark", { wordIds: [] }))).status).toBe(400);
  });
});

// ==================================================================================================
describe("bài thi lên cấp: exam/start + exam/submit", () => {
  it("cấp chưa mở → 403 LOCKED (không thi nhảy cấp)", async () => {
    await newUser();
    await learnA1(12);
    const r = await call(examStart, post("/api/exam/start", { cefr: "A2" }));
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("LOCKED");
  });

  it("chưa học đủ → 403 NOT_ELIGIBLE, báo số từ còn thiếu", async () => {
    await newUser();
    await learnA1(4);
    const r = await call(examStart, post("/api/exam/start", { cefr: "A1" }));
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("NOT_ELIGIBLE");
    expect(r.body.missingWords).toBe(6);
    expect((await q(`select count(*)::int n from level_exams`)).length).toBeGreaterThan(0);
  });

  it("hai request exam/start SONG SONG chỉ tạo MỘT bài", async () => {
    const u = await newUser();
    await learnA1(12);
    at(0);
    const mk = () => examStart(post("/api/exam/start", { cefr: "A1" }));
    const res = await Promise.all([mk(), mk(), mk()]);
    const bodies = await Promise.all(res.map((r) => r.json()));
    expect(res.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(new Set(bodies.map((b: Json) => b.examId)).size).toBe(1);
    expect((await q(`select count(*)::int n from level_exams where user_id = $1`, [u]))[0].n).toBe(1);
    expect(JSON.stringify(bodies[0])).not.toContain("expected");
    expect(bodies[0].items).toHaveLength(8 + 4);
  });

  it("thi trượt → thi lại trong 1 giờ bị 429 COOLDOWN; sau 1 giờ thi lại được", async () => {
    const u = await newUser();
    await learnA1(12);
    const s1 = await call(examStart, post("/api/exam/start", { cefr: "A1" }), 0);
    expect(s1.status).toBe(200);
    const items = await storedExam(s1.body.examId);
    const sub = await call(examSubmit, post("/api/exam/submit", { examId: s1.body.examId, answers: wrong(items) }), 120);
    expect(sub.status).toBe(200);
    expect(sub.body.passed).toBe(false);
    expect(sub.body.attemptsLeftToday).toBe(2);
    expect(sub.body.nextAttemptAt).toBeTruthy();

    const again = await call(examStart, post("/api/exam/start", { cefr: "A1" }), 180);
    expect(again.status).toBe(429);
    expect(again.body.code).toBe("COOLDOWN");
    expect(again.body.nextAt).toBeTruthy();

    const later = await call(examStart, post("/api/exam/start", { cefr: "A1" }), 120 + 61 * 60);
    expect(later.status).toBe(200);
    expect(later.body.resumed).toBe(false);
    expect(later.body.examId).not.toBe(s1.body.examId);
    expect((await q(`select count(*)::int n from level_exams where user_id = $1`, [u]))[0].n).toBe(2);
  });

  it("lượt thứ 4 trong ngày (giờ VN) → 429 DAILY_LIMIT", async () => {
    const u = await newUser();
    await learnA1(12);
    for (let i = 0; i < 3; i++) {
      await q(
        `insert into level_exams (user_id, cefr, items, started_at, expires_at, finished_at, passed, score_total) values ($1, 'A1', '[]', now(), now() + interval '20 minutes', now(), false, 0)`,
        [u],
      );
    }
    const r = await call(examStart, post("/api/exam/start", { cefr: "A1" }));
    expect(r.status).toBe(429);
    expect(r.body.code).toBe("DAILY_LIMIT");
    expect(r.body.attemptsLeft).toBe(0);
    expect(r.body.nextAt).toBeTruthy();
  });

  it("nộp trễ → 410 EXPIRED và bài tính là trượt; bài hết giờ chưa nộp cũng bị đóng khi bắt đầu lại", async () => {
    const u = await newUser();
    await learnA1(12);
    const s = await call(examStart, post("/api/exam/start", { cefr: "A1" }), 0);
    const items = await storedExam(s.body.examId);
    const late = await call(examSubmit, post("/api/exam/submit", { examId: s.body.examId, answers: correct(items) }), (20 * 60) + 31);
    expect(late.status).toBe(410);
    expect(late.body.code).toBe("EXAM_EXPIRED");
    const row = (await q(`select finished_at, passed from level_exams where id = $1`, [s.body.examId]))[0];
    expect(row.finished_at).not.toBeNull();
    expect(row.passed).toBe(false);
    expect((await q(`select count(*)::int n from level_passes where user_id = $1`, [u]))[0].n).toBe(0);
  });

  it("nộp trong thời gian ân hạn (≤30 giây sau hạn) vẫn được chấm", async () => {
    await newUser();
    await learnA1(12);
    const s = await call(examStart, post("/api/exam/start", { cefr: "A1" }), 0);
    const items = await storedExam(s.body.examId);
    const r = await call(examSubmit, post("/api/exam/submit", { examId: s.body.examId, answers: correct(items) }), 20 * 60 + 20);
    expect(r.status).toBe(200);
    expect(r.body.passed).toBe(true);
  });

  it("bài của người khác → 409; nộp hai lần (kể cả song song) chỉ một lần được tính; đạt thì cấp kế mở", async () => {
    const u = await newUser();
    await learnA1(25);
    const s = await call(examStart, post("/api/exam/start", { cefr: "A1" }), 0);
    expect(s.status).toBe(200);
    const items = await storedExam(s.body.examId);
    const payload = { examId: s.body.examId, answers: correct(items) };

    // người khác không nộp được bài của u
    await newUser();
    const stolen = await call(examSubmit, post("/api/exam/submit", payload), 60);
    expect(stolen.status).toBe(409);
    expect(stolen.body.code).toBe("EXAM_INVALID");
    state.user = u;

    // trước khi qua: A2 còn khóa
    expect((await call(examStart, post("/api/exam/start", { cefr: "A2" }), 30)).body.code).toBe("LOCKED");

    // nộp song song hai lần
    at(120);
    const res = await Promise.all([examSubmit(post("/api/exam/submit", payload)), examSubmit(post("/api/exam/submit", payload))]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    const ok = await res.find((r) => r.status === 200)!.json();
    expect(ok.passed).toBe(true);
    expect(ok.scoreTotal).toBeGreaterThanOrEqual(0.8);

    expect((await q(`select cefr from level_passes where user_id = $1`, [u])).map((r) => r.cefr)).toEqual(["A1"]);
    expect((await call(examSubmit, post("/api/exam/submit", payload), 130)).status).toBe(409);

    // đã qua A1 → không thi lại; A2 mở và vào thi được (25 từ ≥ ngưỡng 20)
    expect((await call(examStart, post("/api/exam/start", { cefr: "A1" }), 140)).body.code).toBe("ALREADY_PASSED");
    const a2 = await call(examStart, post("/api/exam/start", { cefr: "A2" }), 150);
    expect(a2.status).toBe(200);
    const h = await call(home, get("/api/home"));
    expect(h.status).toBe(200);
    const lv = Object.fromEntries(h.body.levels.map((l: Json) => [l.cefr, l]));
    expect(lv.A1.pass).toBe(true);
    expect(lv.A2.unlocked).toBe(true);
    expect(lv.B1.unlocked).toBe(false);
  });

  it("XP/SRS không bị bài thi đụng tới (ADR-8)", async () => {
    const u = await newUser();
    await learnA1(12);
    const before = await q(`select xp::int, (select count(*)::int from user_word_progress where user_id = $1 and level >= 3) mastered from profiles where id = $1`, [u]);
    const s = await call(examStart, post("/api/exam/start", { cefr: "A1" }), 0);
    const items = await storedExam(s.body.examId);
    await call(examSubmit, post("/api/exam/submit", { examId: s.body.examId, answers: correct(items) }), 60);
    const after = await q(`select xp::int, (select count(*)::int from user_word_progress where user_id = $1 and level >= 3) mastered from profiles where id = $1`, [u]);
    expect(after[0]).toEqual(before[0]);
  });
});

// ==================================================================================================
describe("trang chủ + bảng xếp hạng", () => {
  it("home trả hồ sơ + 6 cấp; leaderboard trả top XP", async () => {
    await newUser();
    const h = await call(home, get("/api/home"));
    expect(h.status).toBe(200);
    expect(h.body.levels).toHaveLength(6);
    expect(h.body.profile.dailyXpCap).toBeGreaterThan(0);
    const lb = await call(leaderboard, get("/api/leaderboard"));
    expect(lb.status).toBe(200);
    expect((await call(leaderboard, get("/api/leaderboard?blitz=Z9"))).status).toBe(400);
  });
});
