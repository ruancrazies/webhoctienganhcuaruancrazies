import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadSheetConfig } from "../../content/schema/config";
import type { Db } from "../../scripts/content/lib/db";
import { loadContent } from "../../scripts/content/lib/sheet";
import { syncContent, type SyncOptions } from "../../scripts/content/lib/sync";
import { validateContent } from "../../scripts/content/lib/validate";
import { freshDb } from "./helpers";

let pg: PGlite;
let db: Db;

async function fixture() {
  const cfg = loadSheetConfig();
  const loaded = await loadContent(cfg, { fromDir: path.join(__dirname, "..", "fixtures", "sheet-ok") });
  const r = validateContent(loaded.tabs, cfg);
  expect(r.errorCount).toBe(0);
  return structuredClone(r.data);
}
const run = (data: Awaited<ReturnType<typeof fixture>>, opts: SyncOptions = {}) => syncContent(db, data, opts);
const q = async <T extends object>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows;
const status = async (key: string) => (await q<{ status: string }>(`select status from words where key = $1`, [key]))[0].status;

beforeAll(async () => {
  ({ pg, db } = await freshDb());
}, 60000);
afterAll(() => pg.close());

describe("sync", () => {
  it("dry-run không ghi gì", async () => {
    const r = await run(await fixture(), { dryRun: true });
    expect(r.words).toMatchObject({ added: 8, changed: 0, unchanged: 0 });
    expect((await q<{ n: number }>(`select count(*)::int n from words`))[0].n).toBe(0);
    expect((await q<{ n: number }>(`select count(*)::int n from domains`))[0].n).toBe(0);
  });

  it("nạp lần đầu: từ, chủ đề, câu, ngữ pháp, content_stats, content_imports", async () => {
    const r = await run(await fixture());
    expect(r.words).toMatchObject({ added: 8, changed: 0 });
    expect(r.sentences.added).toBe(2);
    expect(r.grammar.added).toBe(2);
    expect((await q(`select 1 from words`)).length).toBe(8);
    expect((await q<{ n: number }>(`select count(*)::int n from word_topics`))[0].n).toBe(9); // jam:v:1 có 2 chủ đề
    expect((await q<{ n: number }>(`select count(*)::int n from sentence_words`))[0].n).toBe(2);
    expect(await q(`select options, answer from grammar_questions where key = 'g:a1:2'`)).toEqual([{ options: ["drink", "drinks", "drinking"], answer: 2 }]);
    const cook = (await q<{ vi_alt: string[]; freq_rank: number; rand: number }>(`select vi_alt, freq_rank, rand from words where key = 'cook:v:1'`))[0];
    expect(cook.vi_alt).toEqual(["nấu nướng", "chế biến"]);
    expect(cook.freq_rank).toBe(1_000_000_000);
    expect(cook.rand).toBeGreaterThanOrEqual(0);
    // content_stats: tổng theo (cefr, domain) và theo chủ đề
    expect(await q(`select word_count n from content_stats where cefr = 'A1' and domain = 'general' and topic_id is null`)).toEqual([{ n: 6 }]);
    expect(await q(`select word_count n from content_stats where cefr = 'A2' and domain = 'medicine' and topic_id is null`)).toEqual([{ n: 1 }]);
    expect((await q(`select 1 from content_imports`)).length).toBe(1);
  });

  it("chạy lại không đổi gì (idempotent)", async () => {
    const r = await run(await fixture());
    expect(r.words).toMatchObject({ added: 0, changed: 0, unchanged: 8, missing: 0 });
    expect(r.sentences).toMatchObject({ added: 0, changed: 0, unchanged: 2 });
    expect(r.grammar).toMatchObject({ added: 0, changed: 0, unchanged: 2 });
  });

  it("sửa nội dung giữ key: cập nhật tại chỗ, id và rand giữ nguyên", async () => {
    const before = (await q<{ id: number; rand: number }>(`select id, rand from words where key = 'apple:n:1'`))[0];
    const data = await fixture();
    data.words.find((w) => w.key === "apple:n:1")!.vi = "trái táo";
    const r = await run(data);
    expect(r.words).toMatchObject({ added: 0, changed: 1, unchanged: 7 });
    expect(r.words.samples.changed).toEqual(["apple:n:1"]);
    const after = (await q<{ id: number; rand: number; vi: string }>(`select id, rand, vi from words where key = 'apple:n:1'`))[0];
    expect(after).toEqual({ ...before, vi: "trái táo" });
  });

  it("đổi chủ đề của từ: word_topics và content_stats được cập nhật", async () => {
    const data = await fixture();
    data.words.find((w) => w.key === "jam:v:1")!.topics = ["food-drink"];
    await run(data);
    expect((await q<{ n: number }>(`select count(*)::int n from word_topics`))[0].n).toBe(8);
  });

  it("từ vắng trên Sheet: chỉ cảnh báo khi không có --retire-missing", async () => {
    const data = await fixture();
    data.words = data.words.filter((w) => w.key !== "cook:v:1");
    const r = await run(data);
    expect(r.words.missing).toBe(1);
    expect(r.words.samples.missing).toEqual(["cook:v:1"]);
    expect(await status("cook:v:1")).toBe("active");
  });

  it("retire hàng loạt vượt 2% bị chặn, không ghi gì; --force thì qua", async () => {
    const data = await fixture();
    data.words = data.words.filter((w) => w.key !== "cook:v:1");
    const blocked = await run(data, { retireMissing: true });
    expect(blocked.blocked).toMatch(/--force/);
    expect(await status("cook:v:1")).toBe("active");

    const ok = await run(data, { retireMissing: true, force: true });
    expect(ok.words.retired).toBe(1);
    expect(await status("cook:v:1")).toBe("retired");
    expect((await q(`select word_count n from content_stats where cefr = 'A1' and domain = 'general' and topic_id is null`))).toEqual([{ n: 6 }]);
    expect((await q(`select 1 from content_stats where cefr = 'A2' and domain = 'general' and topic_id is null`)).length).toBe(0); // cook không còn active
  });

  it("từ xuất hiện lại thì trở về active, rand giữ nguyên", async () => {
    const before = (await q<{ rand: number }>(`select rand from words where key = 'cook:v:1'`))[0].rand;
    const r = await run(await fixture());
    expect(r.words).toMatchObject({ added: 0, changed: 1 });
    expect(await status("cook:v:1")).toBe("active");
    expect((await q<{ rand: number }>(`select rand from words where key = 'cook:v:1'`))[0].rand).toBe(before);
  });

  it("đổi cấp giữ key: tiến độ người dùng không mồ côi, bộ đếm tính lại", async () => {
    const U = "33333333-3333-3333-3333-333333333333";
    await pg.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'z@x.vn', '{"username":"zed"}')`, [U]);
    await pg.query(`select mark_learned($1, array[(select id from words where key = 'cook:v:1')])`, [U]);
    expect(await q(`select cefr, learned from user_level_stats where user_id = $1`, [U])).toEqual([{ cefr: "A2", learned: 1 }]);

    const data = await fixture();
    const w = data.words.find((x) => x.key === "cook:v:1")!;
    w.cefr = "B1"; // chuyển dòng sang tab B1 nhưng giữ key
    const r = await run(data);
    expect(r.words.moved).toBe(1);
    expect(await q(`select cefr from words where key = 'cook:v:1'`)).toEqual([{ cefr: "B1" }]);
    expect(await q(`select cefr from user_word_progress where user_id = $1`, [U])).toEqual([{ cefr: "B1" }]);
    expect(await q(`select cefr, learned from user_level_stats where user_id = $1`, [U])).toEqual([{ cefr: "B1", learned: 1 }]);
  });

  it("sửa câu: sentence_words được dựng lại", async () => {
    const data = await fixture();
    data.sentences[0].words = ["apple:n:1", "jam:n:1"];
    await run(data);
    expect((await q<{ n: number }>(`select count(*)::int n from sentence_words`))[0].n).toBe(3);
  });

  it("chia lô nhỏ cho cùng kết quả", async () => {
    const { pg: pg2, db: db2 } = await freshDb();
    try {
      const r = await syncContent(db2, await fixture(), { batchSize: 3 });
      expect(r.words.added).toBe(8);
      expect((await pg2.query(`select 1 from words`)).rows.length).toBe(8);
      expect((await pg2.query(`select 1 from sentence_words`)).rows.length).toBe(2);
    } finally {
      await pg2.close();
    }
  });
});
