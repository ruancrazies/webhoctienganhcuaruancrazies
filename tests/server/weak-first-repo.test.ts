import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** pickGrammar với chủ đề yếu (weak-first): truy vấn đúng, hạn mức 60%, không trùng câu, hành vi cũ khi không có chủ đề yếu. */
const calls = vi.hoisted(() => ({ list: [] as URL[], reply: [] as unknown[] }));

vi.mock("../../src/server/db", () => ({
  createAdminClient: () =>
    createClient("http://localhost:54321", "k", {
      auth: { persistSession: false },
      global: {
        fetch: async (input: RequestInfo | URL) => {
          calls.list.push(new URL(String(input)));
          return new Response(JSON.stringify(calls.reply.shift() ?? []), { status: 200, headers: { "content-type": "application/json" } });
        },
      },
    }),
}));

import { pickGrammar } from "../../src/server/repo/content";

const g = (id: number, topic = "tenses") => ({ id, level: "B1", topic, question: `q${id}`, options: ["a", "b"], answer: 1, explanation: null });
const rng = () => 0.5;

beforeEach(() => {
  calls.list = [];
  calls.reply = [];
});

describe("pickGrammar", () => {
  it("không có chủ đề yếu: một truy vấn cả cấp như cũ", async () => {
    calls.reply = [[g(1), g(2), g(3)]];
    const out = await pickGrammar("B1", 3, rng);
    expect(out.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(calls.list).toHaveLength(1);
    const p = calls.list[0].searchParams;
    expect(p.get("level")).toBe("eq.B1");
    expect(p.get("status")).toBe("eq.active");
    expect(p.get("topic")).toBeNull();
    expect(p.get("rand")).toBe("gte.0.5");
  });

  it("có chủ đề yếu: tối đa 60% số câu lấy từ chủ đề đó, phần còn lại ngẫu nhiên cả cấp, không trùng câu", async () => {
    // n = 10 → 6 câu yếu (ids 1–6), rồi 10 câu ngẫu nhiên trong đó có câu 2 và 5 trùng → còn 4 câu khác
    calls.reply = [
      [g(1), g(2), g(3), g(4), g(5), g(6)],
      [g(2), g(5), g(7), g(8), g(9), g(10), g(11), g(12), g(13), g(14)],
    ];
    const out = await pickGrammar("B1", 10, rng, ["tenses", "articles"]);
    expect(out).toHaveLength(10);
    expect(new Set(out.map((x) => x.id)).size).toBe(10);
    expect(calls.list).toHaveLength(2);
    expect(calls.list[0].searchParams.get("topic")).toBe("in.(tenses,articles)");
    expect(calls.list[0].searchParams.get("limit")).toBe("6");
    expect(calls.list[1].searchParams.get("topic")).toBeNull();
    expect(calls.list[1].searchParams.get("limit")).toBe("10");
    expect(out.filter((x) => x.id <= 6)).toHaveLength(6);
  });

  it("chủ đề yếu ít câu hơn hạn mức: phần thiếu được bù bằng câu ngẫu nhiên, vẫn đủ n", async () => {
    calls.reply = [
      [g(1)], // gte: chỉ 1 câu yếu
      [], // wrap: hết
      [g(2), g(3), g(4), g(5)],
    ];
    const out = await pickGrammar("B1", 5, rng, ["tenses"]);
    expect(out.map((x) => x.id).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("bỏ câu hỏng dữ liệu (đáp án ngoài khoảng)", async () => {
    calls.reply = [[g(1), { ...g(2), answer: 9 }]];
    expect((await pickGrammar("B1", 2, rng)).map((x) => x.id)).toEqual([1]);
  });
});
