import { readFileSync } from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadSheetConfig } from "../../content/schema/config";
import type { Db } from "../../scripts/content/lib/db";
import { parseTab } from "../../scripts/content/lib/csv";
import { loadContent } from "../../scripts/content/lib/sheet";
import { formatReport, syncContent, type SyncOptions } from "../../scripts/content/lib/sync";
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
const count = async (table: string) => (await q<{ n: number }>(`select count(*)::int n from ${table}`))[0].n;

beforeAll(async () => {
  ({ pg, db } = await freshDb());
}, 60000);
afterAll(() => pg.close());

describe("bảng passages / passage_questions (migration 0009)", () => {
  it("dry-run không ghi gì nhưng báo số lượng", async () => {
    const r = await run(await fixture(), { dryRun: true });
    expect(r.passages.added).toBe(3);
    expect(r.passageQuestions.added).toBe(5);
    expect(await count("passages")).toBe(0);
    expect(await count("passage_questions")).toBe(0);
  });

  it("nạp lần đầu: đoạn văn, câu hỏi, khóa ngoại và thứ tự", async () => {
    const r = await run(await fixture());
    expect(r.passages).toMatchObject({ added: 3, changed: 0 });
    expect(r.passageQuestions).toMatchObject({ added: 5, changed: 0 });
    expect(await q(`select key, skill, level, audio from passages order by key`)).toEqual([
      { key: "p:l:a1:1", skill: "listening", level: "A1", audio: "cafe-1.mp3" },
      { key: "p:r:a1:1", skill: "reading", level: "A1", audio: null },
      { key: "p:r:a2:1", skill: "reading", level: "A2", audio: null },
    ]);
    const body = (await q<{ body: string }>(`select body from passages where key = 'p:l:a1:1'`))[0].body;
    expect(body.split("\n")).toHaveLength(3); // xuống dòng của lời thoại được giữ
    expect(
      await q(`select q.key, p.key as passage, q.kind, q.options, q.answer, q.sort
                 from passage_questions q join passages p on p.id = q.passage_id
                where p.key = 'p:r:a1:1' order by q.sort`),
    ).toEqual([
      { key: "pq:1", passage: "p:r:a1:1", kind: "mcq", options: ["In Hanoi", "In Hue", "In Da Nang"], answer: 1, sort: 1 },
      { key: "pq:2", passage: "p:r:a1:1", kind: "mcq", options: ["By bus", "On foot", "By bike"], answer: 2, sort: 2 },
      { key: "pq:3", passage: "p:r:a1:1", kind: "tf", options: [], answer: 1, sort: 3 },
    ]);
    expect(formatReport(r)).toContain("bài đọc/nghe");
  });

  it("chạy lại không đổi gì (idempotent)", async () => {
    const r = await run(await fixture());
    expect(r.passages).toMatchObject({ added: 0, changed: 0, unchanged: 3, missing: 0 });
    expect(r.passageQuestions).toMatchObject({ added: 0, changed: 0, unchanged: 5, missing: 0 });
  });

  it("sửa đoạn văn giữ key: cập nhật tại chỗ, id và rand giữ nguyên", async () => {
    const before = (await q<{ id: number; rand: number }>(`select id, rand from passages where key = 'p:r:a1:1'`))[0];
    const data = await fixture();
    data.passages.find((p) => p.key === "p:r:a1:1")!.title = "Lan's day";
    const r = await run(data);
    expect(r.passages).toMatchObject({ changed: 1, unchanged: 2 });
    expect(r.passageQuestions.changed).toBe(0);
    const after = (await q<{ id: number; rand: number; title: string }>(`select id, rand, title from passages where key = 'p:r:a1:1'`))[0];
    expect(after).toEqual({ ...before, title: "Lan's day" });
  });

  it("sửa đáp án một câu: chỉ câu đó đổi, vẫn thuộc đúng đoạn văn", async () => {
    const data = await fixture();
    data.passageQuestions.find((x) => x.key === "pq:1")!.answer = 3;
    const r = await run(data);
    expect(r.passageQuestions).toMatchObject({ changed: 1, unchanged: 4 });
    expect(r.passageQuestions.samples.changed).toEqual(["pq:1"]);
    expect(await q(`select answer from passage_questions where key = 'pq:1'`)).toEqual([{ answer: 3 }]);
    await run(await fixture()); // trả lại như cũ
  });

  it("thêm câu hỏi cho bài trước đó chưa có câu", async () => {
    const data = await fixture();
    data.passageQuestions.push({
      key: "pq:6", passage: "p:r:a2:1", kind: "tf", question: "It is short.", options: [], answer: 1, explanation: null, sort: 1,
      at: { tab: "passage_questions", row: 7 },
    });
    const r = await run(data);
    expect(r.passageQuestions.added).toBe(1);
    expect(await q(`select p.key from passage_questions q join passages p on p.id = q.passage_id where q.key = 'pq:6'`)).toEqual([{ key: "p:r:a2:1" }]);
  });

  it("vắng trên Sheet: chỉ cảnh báo, rồi --retire-missing đổi sang retired (không xóa)", async () => {
    const data = await fixture(); // không còn pq:6
    const warn = await run(data);
    expect(warn.passageQuestions.missing).toBe(1);
    expect(await q(`select status from passage_questions where key = 'pq:6'`)).toEqual([{ status: "active" }]);

    const blocked = await run(data, { retireMissing: true });
    expect(blocked.blocked).toMatch(/passageQuestions/); // 1/6 > 2%
    const ok = await run(data, { retireMissing: true, force: true });
    expect(ok.passageQuestions.retired).toBe(1);
    expect(await q(`select status from passage_questions where key = 'pq:6'`)).toEqual([{ status: "retired" }]);
    expect(await count("passage_questions")).toBe(6);
  });

  it("câu hỏi xuất hiện lại thì trở về active", async () => {
    const data = await fixture();
    data.passageQuestions.push({
      key: "pq:6", passage: "p:r:a2:1", kind: "tf", question: "It is short.", options: [], answer: 1, explanation: null, sort: 1,
      at: { tab: "passage_questions", row: 7 },
    });
    const r = await run(data);
    expect(r.passageQuestions).toMatchObject({ added: 0, changed: 1 });
    expect(await q(`select status from passage_questions where key = 'pq:6'`)).toEqual([{ status: "active" }]);
  });

  it("content_imports ghi cả bài đọc/nghe", async () => {
    const last = (await q<{ details: { passages: object; passageQuestions: object } }>(`select details from content_imports order by id desc limit 1`))[0];
    expect(last.details).toHaveProperty("passages");
    expect(last.details).toHaveProperty("passageQuestions");
  });
});

describe("ràng buộc dữ liệu ở tầng DB", () => {
  const pid = () => q<{ id: number }>(`select id from passages where key = 'p:r:a1:1'`).then((r) => r[0].id);
  const ins = async (kind: string, options: string, answer: number) =>
    pg.query(`insert into passage_questions (key, passage_id, kind, question, options, answer) values ($1, $2, $3, 'Q?', $4::jsonb, $5)`, [
      `bad:${Math.random()}`, await pid(), kind, options, answer,
    ]);

  it("mcq: đáp án phải nằm trong số lựa chọn, 2–6 lựa chọn", async () => {
    await expect(ins("mcq", '["a","b","c"]', 4)).rejects.toThrow(/passage_questions_shape/);
    await expect(ins("mcq", '["a"]', 1)).rejects.toThrow(/passage_questions_shape/);
    await expect(ins("mcq", "[]", 1)).rejects.toThrow(/passage_questions_shape/);
  });

  it("tf: không có options, answer chỉ là 1 hoặc 2", async () => {
    await expect(ins("tf", '["a","b"]', 1)).rejects.toThrow(/passage_questions_shape/);
    await expect(ins("tf", "[]", 3)).rejects.toThrow(/passage_questions_shape/);
  });

  it("skill, kind sai bị từ chối", async () => {
    await expect(pg.query(`insert into passages (key, skill, level, title, body) values ('x', 'writing', 'A1', 't', 'b')`)).rejects.toThrow();
    await expect(ins("essay", "[]", 1)).rejects.toThrow();
  });

  it("người dùng đã đăng nhập không đọc được (chứa đáp án và lời thoại bài nghe)", async () => {
    await pg.exec(`set role authenticated`);
    try {
      await expect(pg.query(`select * from passages`)).rejects.toThrow(/permission denied/);
      await expect(pg.query(`select * from passage_questions`)).rejects.toThrow(/permission denied/);
    } finally {
      await pg.exec(`reset role`);
    }
  });
});

describe("bộ seed (content/seed) nạp được vào DB", () => {
  it("10 bài, 41 câu hỏi, qua đủ ràng buộc của bảng", async () => {
    const fresh = await freshDb();
    try {
      const cfg = loadSheetConfig();
      const loaded = await loadContent(cfg, { fromDir: path.join(__dirname, "..", "fixtures", "sheet-ok") });
      const read = (f: string) => readFileSync(path.join(__dirname, "..", "..", "content", "seed", f), "utf8");
      loaded.tabs.set("passages", parseTab("passages", read("passages.csv")).tab);
      loaded.tabs.set("passage_questions", parseTab("passage_questions", read("passage_questions.csv")).tab);
      const v = validateContent(loaded.tabs, cfg);
      expect(v.errorCount).toBe(0);

      const r = await syncContent(fresh.db, v.data);
      expect(r.passages.added).toBe(10);
      expect(r.passageQuestions.added).toBe(41);
      const per = await fresh.pg.query<{ skill: string; level: string; n: number }>(
        `select p.skill, p.level, count(q.id)::int n from passages p join passage_questions q on q.passage_id = p.id
          group by p.skill, p.level order by p.level, p.skill`,
      );
      expect(per.rows).toHaveLength(10);
      expect(per.rows.every((x) => x.n >= 4)).toBe(true);
    } finally {
      await fresh.pg.close();
    }
  }, 60000);
});
