import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Repo hồ sơ năng lực dựng đúng truy vấn PostgREST (supabase-js thật + fetch giả): lọc user, phân trang, không đọc cột nhạy cảm. */
const calls = vi.hoisted(() => ({ list: [] as { url: URL; method: string; body: string | null; range: string | null }[], reply: [] as unknown[] }));

vi.mock("../../src/server/db", () => ({
  createAdminClient: () =>
    createClient("http://localhost:54321", "k", {
      auth: { persistSession: false },
      global: {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const h = new Headers(init?.headers);
          calls.list.push({ url: new URL(String(input)), method: init?.method ?? "GET", body: (init?.body as string | undefined) ?? null, range: h.get("range") });
          const data = calls.reply.shift() ?? [];
          return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
        },
      },
    }),
}));

import { gameResponseMedians, getUserInsights, overdueCount, recentAnswerEvents, recentExamPoints, recentRounds, recentSessions, recordActivity, saveUserInsights } from "../../src/server/repo/insights";

const ME = "11111111-1111-4111-8111-111111111111";
const SINCE = new Date("2026-09-01T00:00:00Z");

beforeEach(() => {
  calls.list = [];
  calls.reply = [];
});

describe("recentAnswerEvents", () => {
  it("lọc đúng user và thời gian, mới nhất trước, đọc 5 trang song song; KHÔNG chọn đáp án", async () => {
    await recentAnswerEvents(ME, SINCE);
    expect(calls.list).toHaveLength(5);
    const pages = calls.list.map((c) => `${c.url.searchParams.get("offset")}+${c.url.searchParams.get("limit")}`).sort();
    expect(pages).toEqual(["0+1000", "1000+1000", "2000+1000", "3000+1000", "4000+1000"]);
    const p = calls.list[0].url.searchParams;
    expect(calls.list[0].url.pathname).toBe("/rest/v1/answer_events");
    expect(p.get("user_id")).toBe(`eq.${ME}`);
    expect(p.get("answered_at")).toBe(`gte.${SINCE.toISOString()}`);
    expect(p.get("order")).toBe("answered_at.desc,id.desc");
    const select = p.get("select")!;
    expect(select).not.toMatch(/answer_value|expected|qid|source_id/);
    expect(select).toContain("grammar_topic");
  });

  it("đổi hàng sang InsightEvent", async () => {
    calls.reply = [[{ game: "quiz", part: "vocab", correct: true, hint_used: false, response_ms: 1500, answered_at: "2026-10-28T05:00:00+00:00", cefr: "A1", pos: "n", domain: "food", grammar_topic: null }]];
    const evs = await recentAnswerEvents(ME, SINCE);
    expect(evs).toEqual([{ game: "quiz", part: "vocab", correct: true, hintUsed: false, responseMs: 1500, at: new Date("2026-10-28T05:00:00Z"), cefr: "A1", pos: "n", domain: "food", grammarTopic: null }]);
  });
});

describe("recentRounds", () => {
  it("chỉ chọn game và mốc thời gian, KHÔNG chọn items (đề + đáp án)", async () => {
    calls.reply = [[{ game: "quiz", created_at: "2026-10-28T05:00:00+00:00", finished_at: null }, { game: "type", created_at: "2026-10-27T05:00:00+00:00", finished_at: "2026-10-27T05:05:00+00:00" }]];
    const rounds = await recentRounds(ME, SINCE);
    expect(rounds).toEqual([
      { game: "quiz", createdAt: new Date("2026-10-28T05:00:00Z"), finishedAt: null },
      { game: "type", createdAt: new Date("2026-10-27T05:00:00Z"), finishedAt: new Date("2026-10-27T05:05:00Z") },
    ]);
    const p = calls.list[0].url.searchParams;
    expect(calls.list[0].url.pathname).toBe("/rest/v1/game_rounds");
    expect(p.get("select")).toBe("game,created_at,finished_at");
    expect(p.get("user_id")).toBe(`eq.${ME}`);
  });
});

describe("recentSessions", () => {
  it("gộp theo session_id: đầu, cuối, số sự kiện; bỏ sự kiện không có phiên", async () => {
    calls.reply = [[
      { session_id: "s1", at: "2026-10-28T05:20:00+00:00" },
      { session_id: "s1", at: "2026-10-28T05:00:00+00:00" },
      { session_id: "s1", at: "2026-10-28T05:10:00+00:00" },
      { session_id: "s2", at: "2026-10-27T01:00:00+00:00" },
      { session_id: null, at: "2026-10-27T02:00:00+00:00" },
    ]];
    const s = await recentSessions(ME, SINCE);
    expect(s).toHaveLength(2);
    const s1 = s.find((x) => x.events === 3)!;
    expect(s1.start).toEqual(new Date("2026-10-28T05:00:00Z"));
    expect(s1.end).toEqual(new Date("2026-10-28T05:20:00Z"));
    expect(s.find((x) => x.events === 1)!.start).toEqual(new Date("2026-10-27T01:00:00Z"));
    expect(calls.list[0].url.pathname).toBe("/rest/v1/activity_events");
  });
});

describe("recentExamPoints", () => {
  it("lấy bài đã nộp có điểm của cả hai bảng, giữ null của phần không có, điểm dạng số", async () => {
    calls.reply = [
      [{ cefr: "A2", passed: true, finished_at: "2026-10-20T05:00:00+00:00", score_total: "0.8", score_vocab: "0.9", score_grammar: "0.7", score_reading: null, score_listening: "0.5" }],
      [{ finished_at: "2026-10-25T05:00:00+00:00", score_total: 0.6, score_vocab: 0.6, score_grammar: 0.6, score_reading: 0.6, score_listening: null }],
    ];
    const pts = await recentExamPoints(ME);
    expect(pts).toHaveLength(2);
    const exam = pts.find((p) => p.kind === "exam")!;
    expect(exam).toMatchObject({ cefr: "A2", passed: true, total: 0.8, vocab: 0.9, grammar: 0.7, reading: null, listening: 0.5 });
    expect(pts.find((p) => p.kind === "practice")).toMatchObject({ cefr: null, passed: null, reading: 0.6, listening: null });
    const paths = calls.list.map((c) => c.url.pathname).sort();
    expect(paths).toEqual(["/rest/v1/level_exams", "/rest/v1/practice_tests"]);
    for (const c of calls.list) {
      expect(c.url.searchParams.get("finished_at")).toBe("not.is.null");
      expect(c.url.searchParams.get("score_total")).toBe("not.is.null");
      expect(c.url.searchParams.get("limit")).toBe("2");
      expect(c.url.searchParams.get("select")).not.toMatch(/\bitems\b|answers/);
    }
  });
});

describe("overdueCount", () => {
  it("đếm từ có next_review ≤ now − 2 ngày của đúng user, không tải dòng", async () => {
    await overdueCount(ME, new Date("2026-10-28T00:00:00Z"));
    const c = calls.list[0];
    expect(c.method).toBe("HEAD");
    expect(c.url.pathname).toBe("/rest/v1/user_word_progress");
    expect(c.url.searchParams.get("user_id")).toBe(`eq.${ME}`);
    expect(c.url.searchParams.get("next_review")).toBe("lte.2026-10-26T00:00:00.000Z");
  });
});

describe("RPC và hồ sơ đã lưu", () => {
  it("recordActivity gọi record_activity với p_user/p_type/p_props và trả session_id", async () => {
    calls.reply = ["0a1b2c3d-1111-4222-8333-444455556666"];
    const sid = await recordActivity(ME, "play/start", { game: "quiz" });
    expect(sid).toBe("0a1b2c3d-1111-4222-8333-444455556666");
    expect(calls.list[0].url.pathname).toBe("/rest/v1/rpc/record_activity");
    expect(JSON.parse(calls.list[0].body!)).toEqual({ p_user: ME, p_type: "play/start", p_props: { game: "quiz" } });
  });

  it("gameResponseMedians trả bản đồ game → trung vị", async () => {
    calls.reply = [[{ game: "quiz", median_ms: 1500, n: 100 }, { game: "type", median_ms: "4200", n: 50 }]];
    expect(await gameResponseMedians()).toEqual({ quiz: 1500, type: 4200 });
    expect(JSON.parse(calls.list[0].body!)).toEqual({ p_days: 90 });
  });

  it("getUserInsights: không có dòng → null; có → data + updatedAt", async () => {
    calls.reply = [[]];
    expect(await getUserInsights(ME)).toBeNull();
    calls.reply = [{ data: { v: 1 }, updated_at: "2026-10-28T05:00:00+00:00" }];
    expect(await getUserInsights(ME)).toEqual({ data: { v: 1 }, updatedAt: new Date("2026-10-28T05:00:00Z") });
  });

  it("saveUserInsights: upsert theo user_id", async () => {
    await saveUserInsights(ME, { v: 1 }, new Date("2026-10-28T05:00:00Z"));
    const c = calls.list[0];
    expect(c.method).toBe("POST");
    expect(c.url.pathname).toBe("/rest/v1/user_insights");
    expect(c.url.searchParams.get("on_conflict")).toBe("user_id");
    expect(JSON.parse(c.body!)).toEqual({ user_id: ME, data: { v: 1 }, updated_at: "2026-10-28T05:00:00.000Z" });
  });
});
