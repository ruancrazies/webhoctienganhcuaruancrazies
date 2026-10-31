import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_WEAK, type WeakProfile } from "../../src/core/insights";

/** pickWords: từ đến hạn thuộc nhóm yếu được ưu tiên (tối đa 60% số chỗ); hồ sơ rỗng = hành vi cũ. */
const calls = vi.hoisted(() => ({ reply: [] as unknown[] }));

vi.mock("../../src/server/db", () => ({
  createAdminClient: () =>
    createClient("http://localhost:54321", "k", {
      auth: { persistSession: false },
      global: {
        fetch: async () => new Response(JSON.stringify(calls.reply.shift() ?? []), { status: 200, headers: { "content-type": "application/json" } }),
      },
    }),
}));

import { pickWords } from "../../src/server/repo/progress";

const row = (id: number, pos: string, domain = "general", cefr = "A1") => ({ word_id: id, words: { id, key: `en:${pos}:${id}`, en: `w${id}`, pos, vi: `v${id}`, vi_alt: null, ipa: null, cefr, domain } });
const SCOPE = { cefr: "A1" as const, domain: "all" as const };
const NOW = new Date("2026-10-28T05:00:00Z");
const identity = () => 0.99; // rng cố định: shuffle tất định
const weakAdj: WeakProfile = { vocab: [{ cefr: "A1", pos: "adj", score: 2 }], grammar: [] };

// 10 từ đến hạn: 2, 4, 5, 7, 9 là tính từ (yếu); còn lại là danh từ
const DUE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) => row(id, [2, 4, 5, 7, 9].includes(id) ? "adj" : "n"));

beforeEach(() => {
  calls.reply = [];
});

describe("pickWords weak-first", () => {
  it("hồ sơ rỗng: giống hành vi cũ (không ưu tiên gì)", async () => {
    calls.reply = [DUE];
    const a = await pickWords("u", SCOPE, 5, false, identity, NOW, EMPTY_WEAK);
    calls.reply = [DUE];
    const b = await pickWords("u", SCOPE, 5, false, identity, NOW);
    expect(a.words.map((w) => w.id)).toEqual(b.words.map((w) => w.id));
    expect(a.practice).toBe(false);
  });

  it("có nhóm yếu: tính từ chiếm ceil(5 × 0,6) = 3 chỗ trong 5, phần còn lại là danh từ", async () => {
    calls.reply = [DUE];
    const r = await pickWords("u", SCOPE, 5, false, identity, NOW, weakAdj);
    expect(r.words).toHaveLength(5);
    expect(r.words.filter((w) => w.pos === "adj")).toHaveLength(3);
    expect(r.words.filter((w) => w.pos === "n")).toHaveLength(2);
    expect(new Set(r.words.map((w) => w.id)).size).toBe(5);
  });

  it("chỉ ưu tiên trong cùng cấp: nhóm yếu của cấp khác không ảnh hưởng", async () => {
    calls.reply = [DUE];
    const weakB1: WeakProfile = { vocab: [{ cefr: "B1", pos: "adj", score: 2 }], grammar: [] };
    const a = await pickWords("u", SCOPE, 5, false, identity, NOW, weakB1);
    calls.reply = [DUE];
    const b = await pickWords("u", SCOPE, 5, false, identity, NOW, EMPTY_WEAK);
    expect(a.words.map((w) => w.id)).toEqual(b.words.map((w) => w.id));
  });

  it("không có từ nào thuộc nhóm yếu: vẫn đủ n từ, không lỗi", async () => {
    calls.reply = [[1, 3, 6, 8, 10].map((id) => row(id, "n"))];
    const r = await pickWords("u", SCOPE, 4, false, identity, NOW, weakAdj);
    expect(r.words).toHaveLength(4);
  });

  it("nhóm yếu theo lĩnh vực cũng khớp", async () => {
    const weakTravel: WeakProfile = { vocab: [{ cefr: "A1", domain: "travel", score: 1 }], grammar: [] };
    calls.reply = [[row(1, "n"), row(2, "n", "travel"), row(3, "n"), row(4, "n", "travel"), row(5, "n")]];
    const r = await pickWords("u", SCOPE, 2, false, identity, NOW, weakTravel);
    expect(r.words.map((w) => w.domain)).toEqual(["travel", "travel"]); // quota = ceil(2 × 0,6) = 2
  });
});
