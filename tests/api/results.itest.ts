/**
 * Giai đoạn 1b — API xem lại kết quả, chạy qua ĐÚNG Route Handler + service + repo + PostgREST thật (Supabase local).
 * Dữ liệu là các dòng level_exams / practice_tests đã nộp, chèn thẳng bằng SQL (không cần nội dung từ vựng).
 *
 * Chạy:  npx supabase start   →   npm run test:api
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { makePool, requireLocalEnv } from "./helpers";

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

import { GET as list } from "../../src/app/api/results/route";
import { GET as detail } from "../../src/app/api/results/[type]/[id]/route";
import { POST as review } from "../../src/app/api/results/review/route";

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
let pool: Pool;
const users: string[] = [];
const words: number[] = [];

const q = async <T = Json>(sql: string, params: unknown[] = []): Promise<T[]> => (await pool.query(sql, params)).rows as T[];
const get = (url: string) => new Request(`http://localhost${url}`);
const post = (url: string, body: unknown) =>
  new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const call = async (fn: () => Promise<Response>) => {
  const res = await fn();
  return { status: res.status, body: (await res.json()) as Json };
};
const getList = (qs = "") => call(() => list(get(`/api/results${qs}`)));
const getDetail = (type: string, id: string) => call(() => detail(get(`/api/results/${type}/${id}`), { params: Promise.resolve({ type, id }) }));

async function newUser(): Promise<string> {
  const id = randomUUID();
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${id}@itest.local`, JSON.stringify({ username: `rs_${id.slice(0, 8)}` })]);
  users.push(id);
  state.user = id;
  return id;
}

const ITEMS = (wordId: number) => [
  { qid: "q1", game: "quiz", prompt: "cat?", expected: "mèo", options: ["mèo", "chó"], part: "vocab", wordId },
  { qid: "q2", game: "grammar", prompt: "She ___ home", expected: "goes", options: ["go", "goes"], part: "grammar", grammarId: 1 },
];
const ANSWERS = [
  { qid: "q1", value: "chó", correct: false, near: false },
  { qid: "q2", value: "goes", correct: true, near: false },
];

/** Chèn một bài đã nộp; `minutesAgo` để điều khiển thứ tự. Trả id. */
async function examRow(user: string, o: { minutesAgo: number; cefr?: string; answers?: unknown; wordId?: number }): Promise<string> {
  return (
    await q<{ id: string }>(
      `insert into level_exams (user_id, cefr, items, answers, started_at, expires_at, finished_at, passed, score_total, score_vocab, score_grammar)
       values ($1, $2, $3, $4, now() - ($5 || ' minutes')::interval - interval '20 minutes', now() + interval '1 hour', now() - ($5 || ' minutes')::interval, false, 0.5, 0.5, 0.5) returning id`,
      [user, o.cefr ?? "A1", JSON.stringify(ITEMS(o.wordId ?? 0)), o.answers === undefined ? JSON.stringify(ANSWERS) : o.answers, String(o.minutesAgo)],
    )
  )[0].id;
}
async function practiceRow(user: string, o: { minutesAgo: number; wordId?: number }): Promise<string> {
  return (
    await q<{ id: string }>(
      `insert into practice_tests (user_id, items, answers, started_at, expires_at, finished_at, score_total, score_vocab, score_grammar)
       values ($1, $2, $3, now() - ($4 || ' minutes')::interval - interval '20 minutes', now() + interval '1 hour', now() - ($4 || ' minutes')::interval, 0.5, 0.5, 0.5) returning id`,
      [user, JSON.stringify(ITEMS(o.wordId ?? 0)), JSON.stringify(ANSWERS), String(o.minutesAgo)],
    )
  )[0].id;
}

beforeAll(async () => {
  const { dbUrl } = requireLocalEnv();
  pool = makePool(dbUrl);
  await q(`delete from auth.users where email like '%@itest.local'`);
  await q(`insert into domains (code, title) values ('general', 'Chung') on conflict do nothing`);
});
afterAll(async () => {
  if (users.length) await q(`delete from auth.users where id = any($1)`, [users]);
  if (words.length) await q(`delete from words where id = any($1)`, [words]);
  await pool.end();
});

describe("GET /api/results", () => {
  it("cần đăng nhập", async () => {
    state.user = null;
    expect((await getList()).status).toBe(401);
  });

  it("chỉ thấy bài của CHÍNH MÌNH, trộn hai bảng, mới nhất trước", async () => {
    const other = await newUser();
    await examRow(other, { minutesAgo: 1 });
    const me = await newUser();
    const e1 = await examRow(me, { minutesAgo: 30 });
    const p1 = await practiceRow(me, { minutesAgo: 20 });
    const e2 = await examRow(me, { minutesAgo: 10, cefr: "A2" });
    const r = await getList();
    expect(r.status).toBe(200);
    expect(r.body.items.map((i: Json) => i.id)).toEqual([e2, p1, e1]);
    expect(r.body.items.map((i: Json) => i.type)).toEqual(["exam", "practice", "exam"]);
    expect(r.body.items[0]).toMatchObject({ cefr: "A2", passed: false, hasDetail: true });
    expect(r.body.items[1]).toMatchObject({ cefr: null, passed: null });
    expect(r.body.nextCursor).toBeUndefined();
  });

  it("phân trang keyset: không sót, không lặp, đúng thứ tự", async () => {
    const me = await newUser();
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) ids.push(i % 2 ? await practiceRow(me, { minutesAgo: 100 - i }) : await examRow(me, { minutesAgo: 100 - i }));
    const expected = [...ids].reverse(); // chèn cũ → mới, hiển thị mới → cũ
    const got: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const r = await getList(`?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      expect(r.status).toBe(200);
      got.push(...r.body.items.map((i: Json) => i.id));
      cursor = r.body.nextCursor;
      if (!cursor) break;
    }
    expect(got).toEqual(expected);
  });

  it("lọc type / cefr; cấp thì bỏ bài kiểm tra", async () => {
    const me = await newUser();
    await examRow(me, { minutesAgo: 5, cefr: "A1" });
    await examRow(me, { minutesAgo: 4, cefr: "A2" });
    await practiceRow(me, { minutesAgo: 3 });
    expect((await getList("?type=practice")).body.items).toHaveLength(1);
    expect((await getList("?type=exam")).body.items).toHaveLength(2);
    const a2 = await getList("?cefr=A2");
    expect(a2.body.items).toHaveLength(1);
    expect(a2.body.items[0]).toMatchObject({ type: "exam", cefr: "A2" });
  });

  it("bài cũ không có answers: vẫn có trong danh sách, hasDetail=false; tham số bậy bị từ chối", async () => {
    const me = await newUser();
    await examRow(me, { minutesAgo: 5, answers: null });
    expect((await getList()).body.items[0]).toMatchObject({ hasDetail: false });
    expect((await getList("?limit=0")).status).toBe(400);
    expect((await getList("?type=zzz")).status).toBe(400);
    expect((await getList("?cursor=bậy")).status).toBe(400);
  });

  it("bài đang làm dở không xuất hiện", async () => {
    const me = await newUser();
    await q(`insert into level_exams (user_id, cefr, items, expires_at) values ($1, 'A1', '[]', now() + interval '20 minutes')`, [me]);
    expect((await getList()).body.items).toEqual([]);
  });
});

describe("GET /api/results/[type]/[id]", () => {
  it("dựng lại bài: đề, đáp án đã chọn, đáp án đúng, thống kê theo phần", async () => {
    const me = await newUser();
    const id = await examRow(me, { minutesAgo: 5 });
    const r = await getDetail("exam", id);
    expect(r.status).toBe(200);
    expect(r.body.items).toMatchObject([
      { qid: "q1", yourAnswer: "chó", expected: "mèo", correct: false, options: ["mèo", "chó"] },
      { qid: "q2", yourAnswer: "goes", expected: "goes", correct: true },
    ]);
    expect(r.body.parts).toEqual([{ part: "vocab", total: 1, correct: 0 }, { part: "grammar", total: 1, correct: 1 }]);
    expect(r.body).toMatchObject({ type: "exam", cefr: "A1", weakPart: "vocab", scores: { total: 0.5 } });
    expect(r.body.passMarks).toBeTruthy();
  });

  it("bài kiểm tra thường xuyên cũng xem lại được", async () => {
    const me = await newUser();
    const id = await practiceRow(me, { minutesAgo: 5 });
    const r = await getDetail("practice", id);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ type: "practice", cefr: null, passMarks: null });
  });

  it("BÀI CỦA NGƯỜI KHÁC: 404 (không phân biệt với bài không tồn tại), kể cả khi đoán đúng id", async () => {
    const owner = await newUser();
    const id = await examRow(owner, { minutesAgo: 5 });
    const pid = await practiceRow(owner, { minutesAgo: 6 });
    await newUser(); // đổi phiên sang người khác
    expect((await getDetail("exam", id)).status).toBe(404);
    expect((await getDetail("practice", pid)).status).toBe(404);
    expect((await getDetail("exam", randomUUID())).status).toBe(404);
  });

  it("đúng loại: id của bài thi mở bằng type=practice thì 404", async () => {
    const me = await newUser();
    const id = await examRow(me, { minutesAgo: 5 });
    expect((await getDetail("practice", id)).status).toBe(404);
  });

  it("bài đang làm dở: 404, không lộ đề và đáp án", async () => {
    const me = await newUser();
    const id = (await q<{ id: string }>(`insert into level_exams (user_id, cefr, items, expires_at) values ($1, 'A1', $2, now() + interval '20 minutes') returning id`, [me, JSON.stringify(ITEMS(0))]))[0].id;
    expect((await getDetail("exam", id)).status).toBe(404);
  });

  it("bài cũ (answers null): 409 NO_DETAIL", async () => {
    const me = await newUser();
    const id = await examRow(me, { minutesAgo: 5, answers: null });
    const r = await getDetail("exam", id);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("NO_DETAIL");
  });

  it("id / loại sai dạng: 400", async () => {
    await newUser();
    expect((await getDetail("exam", "khong-phai-uuid")).status).toBe(400);
    expect((await getDetail("zzz", randomUUID())).status).toBe(400);
  });
});

describe("POST /api/results/review", () => {
  it("hạ next_review của từ đã học làm sai về hiện tại; không đổi level; chạy lại không đổi thêm", async () => {
    const me = await newUser();
    const w = (await q<{ id: number }>(`insert into words (key, en, pos, vi, cefr, domain, freq_rank) values ($1, 'itestrv', 'n', 'x', 'A1', 'general', 1) returning id`, [`itest:rv:${randomUUID()}`]))[0].id;
    words.push(w);
    await q(`insert into user_word_progress (user_id, word_id, cefr, domain, level, next_review) values ($1, $2, 'A1', 'general', 3, now() + interval '5 days')`, [me, w]);
    const id = await examRow(me, { minutesAgo: 5, wordId: w });

    const r1 = await call(() => review(post("/api/results/review", { type: "exam", id })));
    expect(r1.status).toBe(200);
    expect(r1.body).toEqual({ wrongWords: 1, scheduled: 1 });
    const p = (await q(`select level, next_review <= now() as due from user_word_progress where user_id = $1 and word_id = $2`, [me, w]))[0];
    expect(p).toMatchObject({ level: 3, due: true });

    const r2 = await call(() => review(post("/api/results/review", { type: "exam", id })));
    expect(r2.body).toEqual({ wrongWords: 1, scheduled: 0 });
  });

  it("từ chưa học (không có dòng tiến độ) không bị tạo mới", async () => {
    const me = await newUser();
    const id = await practiceRow(me, { minutesAgo: 5, wordId: 999999999 });
    const r = await call(() => review(post("/api/results/review", { type: "practice", id })));
    expect(r.body).toEqual({ wrongWords: 1, scheduled: 0 });
    expect((await q(`select count(*)::int n from user_word_progress where user_id = $1`, [me]))[0].n).toBe(0);
  });

  it("bài của người khác: 404, lịch ôn của chủ bài KHÔNG bị đụng", async () => {
    const owner = await newUser();
    const w = (await q<{ id: number }>(`insert into words (key, en, pos, vi, cefr, domain, freq_rank) values ($1, 'itestrv2', 'n', 'x', 'A1', 'general', 2) returning id`, [`itest:rv2:${randomUUID()}`]))[0].id;
    words.push(w);
    await q(`insert into user_word_progress (user_id, word_id, cefr, domain, level, next_review) values ($1, $2, 'A1', 'general', 3, now() + interval '5 days')`, [owner, w]);
    const id = await examRow(owner, { minutesAgo: 5, wordId: w });
    await newUser();
    const r = await call(() => review(post("/api/results/review", { type: "exam", id })));
    expect(r.status).toBe(404);
    expect((await q(`select next_review > now() + interval '4 days' as still_future from user_word_progress where user_id = $1`, [owner]))[0].still_future).toBe(true);
  });
});
