import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Repo xem lại kết quả dựng đúng truy vấn PostgREST. Không có Supabase thật trong `npm test`, nên dùng supabase-js THẬT
 * với `fetch` giả để đọc đúng URL/method/body nó gửi đi (cú pháp `or=(...)`, mã hóa dấu '+', lọc user_id, chỉ UPDATE từ chưa đến hạn).
 */
const calls = vi.hoisted(() => ({ list: [] as { url: URL; method: string; body: string | null }[], reply: [] as unknown[] }));

vi.mock("../../src/server/db", () => ({
  createAdminClient: () =>
    createClient("http://localhost:54321", "k", {
      auth: { persistSession: false },
      global: {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          calls.list.push({ url: new URL(String(input)), method: init?.method ?? "GET", body: (init?.body as string | undefined) ?? null });
          const data = calls.reply.shift() ?? [];
          return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
        },
      },
    }),
}));

import { getFinishedExam, listFinishedExams, listFinishedPractices, scheduleReviewNow } from "../../src/server/repo/results";

const ME = "11111111-1111-4111-8111-111111111111";
const ID = "0a1b2c3d-1111-4222-8333-444455556666";
const last = () => calls.list[calls.list.length - 1];

beforeEach(() => {
  calls.list = [];
  calls.reply = [];
});

describe("listFinishedExams", () => {
  it("lọc đúng user, chỉ bài đã nộp có điểm, mới nhất trước, limit; KHÔNG chọn cột items (đề)", async () => {
    await listFinishedExams(ME, { limit: 21 });
    const p = last().url.searchParams;
    expect(last().url.pathname).toBe("/rest/v1/level_exams");
    expect(p.get("user_id")).toBe(`eq.${ME}`);
    expect(p.get("finished_at")).toBe("not.is.null");
    expect(p.get("score_total")).toBe("not.is.null");
    expect(p.get("order")).toBe("finished_at.desc,id.desc");
    expect(p.get("limit")).toBe("21");
    expect(p.get("select")).not.toMatch(/\bitems\b/);
    expect(p.get("or")).toBeNull();
  });

  it("con trỏ keyset: (finished_at < t) hoặc (finished_at = t và id < id); dấu '+' của múi giờ được mã hóa", async () => {
    await listFinishedExams(ME, { limit: 5, before: { finishedAt: "2026-10-28T09:37:12.123456+00:00", id: ID } });
    const raw = last().url.search;
    expect(raw).toContain("%2B00%3A00"); // '+00:00' phải thành %2B, nếu không server hiểu '+' là dấu cách
    expect(last().url.searchParams.get("or")).toBe(`(finished_at.lt.2026-10-28T09:37:12.123456+00:00,and(finished_at.eq.2026-10-28T09:37:12.123456+00:00,id.lt.${ID}))`);
  });

  it("lọc cấp", async () => {
    await listFinishedExams(ME, { limit: 5, cefr: "B1" });
    expect(last().url.searchParams.get("cefr")).toBe("eq.B1");
  });

  it("map điểm (numeric trả về dạng chuỗi), hasAnswers theo độ dài mảng answers", async () => {
    calls.reply.push([
      { id: ID, cefr: "A1", finished_at: "2026-10-28T09:37:12.123456+00:00", passed: true, answers: [{ qid: "q1" }], score_total: "0.85", score_vocab: "0.9", score_grammar: 0.8, score_reading: null, score_listening: "1" },
      { id: ID.replace("0a", "0b"), cefr: "A2", finished_at: "2026-10-27T09:00:00+00:00", passed: false, answers: null, score_total: 0, score_vocab: 0, score_grammar: 0, score_reading: null, score_listening: null },
    ]);
    const rows = await listFinishedExams(ME, { limit: 5 });
    expect(rows[0]).toMatchObject({ finishedAtRaw: "2026-10-28T09:37:12.123456+00:00", hasAnswers: true, passed: true, scores: { total: 0.85, vocab: 0.9, grammar: 0.8, reading: null, listening: 1 } });
    expect(rows[1]).toMatchObject({ hasAnswers: false, scores: { total: 0, reading: null } });
  });
});

describe("listFinishedPractices", () => {
  it("cùng quy tắc, bảng practice_tests, cefr/passed luôn null", async () => {
    calls.reply.push([{ id: ID, finished_at: "2026-10-28T09:00:00+00:00", answers: [], score_total: 0.5, score_vocab: 0.5, score_grammar: 0.5, score_reading: null, score_listening: null }]);
    const rows = await listFinishedPractices(ME, { limit: 3 });
    expect(last().url.pathname).toBe("/rest/v1/practice_tests");
    expect(last().url.searchParams.get("user_id")).toBe(`eq.${ME}`);
    expect(rows[0]).toMatchObject({ cefr: null, passed: null, hasAnswers: false }); // mảng rỗng = không có chi tiết
  });
});

describe("getFinishedExam", () => {
  it("lọc theo id VÀ user_id VÀ đã nộp: bài của người khác không bao giờ trả về", async () => {
    await getFinishedExam(ME, ID);
    const p = last().url.searchParams;
    expect(p.get("id")).toBe(`eq.${ID}`);
    expect(p.get("user_id")).toBe(`eq.${ME}`);
    expect(p.get("finished_at")).toBe("not.is.null");
  });
});

describe("scheduleReviewNow", () => {
  const NOW = new Date("2026-10-28T10:00:00.000Z");

  it("không có từ: không gọi DB", async () => {
    expect(await scheduleReviewNow(ME, [], NOW)).toBe(0);
    expect(calls.list).toHaveLength(0);
  });

  it("UPDATE chỉ next_review/updated_at (KHÔNG đụng level), đúng user, đúng các từ, chỉ từ chưa đến hạn; trả số dòng đổi", async () => {
    calls.reply.push([{ word_id: 1 }, { word_id: 3 }]);
    expect(await scheduleReviewNow(ME, [1, 2, 3], NOW)).toBe(2);
    const c = last();
    expect(c.method).toBe("PATCH");
    expect(c.url.pathname).toBe("/rest/v1/user_word_progress");
    expect(JSON.parse(c.body!)).toEqual({ next_review: NOW.toISOString(), updated_at: NOW.toISOString() });
    const p = c.url.searchParams;
    expect(p.get("user_id")).toBe(`eq.${ME}`);
    expect(p.get("word_id")).toBe("in.(1,2,3)");
    expect(p.get("next_review")).toBe(`gt.${NOW.toISOString()}`);
  });
});
