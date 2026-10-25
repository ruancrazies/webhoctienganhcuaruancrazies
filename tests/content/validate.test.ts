import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSheetConfig, loadLevels } from "../../content/schema/config";
import { parseTab } from "../../scripts/content/lib/csv";
import { loadContent } from "../../scripts/content/lib/sheet";
import { validateContent } from "../../scripts/content/lib/validate";

const fixture = (name: string) => path.join(__dirname, "..", "fixtures", name);

async function run(name: string) {
  const cfg = loadSheetConfig();
  const loaded = await loadContent(cfg, { fromDir: fixture(name) });
  const result = validateContent(loaded.tabs, cfg);
  return { ...result, issues: [...loaded.loadIssues, ...result.issues] };
}
const find = (issues: { code: string; tab: string; row?: number }[], code: string, tab: string, row?: number) =>
  issues.some((i) => i.code === code && i.tab === tab && (row === undefined || i.row === row));

describe("cấu hình", () => {
  it("levels.yml hợp lệ", () => {
    const l = loadLevels();
    expect(l.examMinWords.A1).toBe(100);
    expect(l.examMinWords.A2).toBe(100);
    expect(l.exam.vocab.total + l.exam.grammar.total).toBe(30);
  });
});

describe("validate — dữ liệu đúng", () => {
  it("không có lỗi, chỉ có cảnh báo mong đợi", async () => {
    const r = await run("sheet-ok");
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(r.data.words).toHaveLength(8);
    expect(r.data.grammar.map((g) => g.answer)).toEqual([1, 2]); // 'drinks' → 2
    const codes = new Set(r.issues.map((i) => i.code));
    expect(codes).toContain("DUP_EN_POS"); // bank:n:1 / bank:n:2
    expect(codes).toContain("EXTRA_COLUMN"); // Specialized vocabulary
    expect(codes).toContain("VI_SEMICOLON");
    expect(codes).toContain("NO_SENTENCE");
    expect(codes).toContain("MISSING_TAB"); // chưa có B1…C2
  });

  it("rank trống → 1.000.000.000; vi_alt tách theo ';'", async () => {
    const r = await run("sheet-ok");
    const cook = r.data.words.find((w) => w.key === "cook:v:1")!;
    expect(cook.freqRank).toBe(1_000_000_000);
    expect(cook.viAlt).toEqual(["nấu nướng", "chế biến"]);
    expect(r.data.words.find((w) => w.key === "apple:n:1")!.freqRank).toBe(1);
    expect(r.data.words.find((w) => w.key === "jam:v:1")!.topics).toEqual(["home-objects", "food-drink"]);
  });
});

describe("validate — dữ liệu sai báo đúng tab + số dòng", () => {
  it("bắt đủ các lỗi", async () => {
    const r = await run("sheet-bad");
    const i = r.issues;
    expect(find(i, "DUP_KEY", "A1", 3)).toBe(true); // trùng trong cùng tab
    expect(find(i, "DUP_KEY", "A2", 2)).toBe(true); // trùng xuyên tab
    expect(find(i, "NO_KEY", "A1", 4)).toBe(true);
    expect(find(i, "BAD_KEY", "A1", 5)).toBe(true);
    expect(find(i, "INVALID_POS", "A1", 6)).toBe(true);
    expect(find(i, "CEFR_TAB_MISMATCH", "A1", 7)).toBe(true);
    expect(find(i, "UNKNOWN_DOMAIN", "A1", 8)).toBe(true);
    expect(find(i, "UNKNOWN_TOPIC", "A1", 9)).toBe(true);
    expect(find(i, "BAD_NUMBER", "A1", 10)).toBe(true);
    expect(find(i, "CEFR_TAB_MISMATCH", "A2", 2)).toBe(false); // A2/A2 đúng
    expect(find(i, "UNKNOWN_WORD", "sentences", 3)).toBe(true);
    expect(find(i, "BAD_ANSWER", "grammar", 2)).toBe(true);
    expect(find(i, "BAD_ANSWER", "grammar", 3)).toBe(true);
    expect(r.errorCount).toBeGreaterThan(0);
  });

  it("dòng lỗi không lọt vào dữ liệu đã chuẩn hóa", async () => {
    const r = await run("sheet-bad");
    expect(r.data.words.map((w) => w.key)).toEqual(["apple:n:1"]); // chỉ dòng 2 của A1 hợp lệ
  });
});

describe("validate — bài đọc / bài nghe", () => {
  it("dữ liệu đúng: chuẩn hóa answer, sort, nhiều dòng", async () => {
    const r = await run("sheet-ok");
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(r.data.passages.map((p) => p.key)).toEqual(["p:r:a1:1", "p:l:a1:1", "p:r:a2:1"]);
    const listening = r.data.passages.find((p) => p.key === "p:l:a1:1")!;
    expect(listening).toMatchObject({ skill: "listening", level: "A1", audio: "cafe-1.mp3", topic: "food-drink" });
    expect(listening.body.split("\n")).toHaveLength(3);
    const q = Object.fromEntries(r.data.passageQuestions.map((x) => [x.key, x]));
    expect(q["pq:1"]).toMatchObject({ kind: "mcq", answer: 1, sort: 1, options: ["In Hanoi", "In Hue", "In Da Nang"] });
    expect(q["pq:2"]).toMatchObject({ answer: 2, sort: 2 }); // answer ghi bằng văn bản "On foot"
    expect(q["pq:3"]).toMatchObject({ kind: "tf", answer: 1, options: [] }); // true
    expect(q["pq:4"]).toMatchObject({ kind: "tf", answer: 2, sort: 1 }); // "Sai"; sort đếm riêng theo từng bài
    expect(q["pq:5"].sort).toBe(2);
  });

  it("bài chưa có câu hỏi chỉ bị cảnh báo", async () => {
    const r = await run("sheet-ok");
    expect(find(r.issues, "NO_QUESTIONS", "passages", 4)).toBe(true);
    expect(r.issues.find((i) => i.code === "NO_QUESTIONS")!.level).toBe("warn");
  });

  it("dữ liệu sai báo đúng tab + số dòng", async () => {
    const r = await run("sheet-bad");
    const i = r.issues;
    expect(find(i, "DUP_KEY", "passages", 3)).toBe(true);
    expect(find(i, "NO_KEY", "passages", 4)).toBe(true);
    expect(find(i, "BAD_KEY", "passages", 5)).toBe(true);
    expect(find(i, "INVALID_SKILL", "passages", 6)).toBe(true);
    expect(find(i, "INVALID_CEFR", "passages", 7)).toBe(true);
    expect(find(i, "EMPTY_FIELD", "passages", 8)).toBe(true);
    expect(find(i, "NO_QUESTIONS", "passages", 9)).toBe(true);

    expect(find(i, "UNKNOWN_PASSAGE", "passage_questions", 3)).toBe(true);
    expect(find(i, "INVALID_KIND", "passage_questions", 4)).toBe(true);
    expect(find(i, "BAD_OPTIONS", "passage_questions", 5)).toBe(true); // 1 lựa chọn
    expect(find(i, "BAD_ANSWER", "passage_questions", 6)).toBe(true); // ngoài khoảng
    expect(find(i, "BAD_ANSWER", "passage_questions", 7)).toBe(true); // văn bản không khớp
    expect(find(i, "BAD_ANSWER", "passage_questions", 8)).toBe(true); // tf không phải true/false
    expect(find(i, "BAD_OPTIONS", "passage_questions", 9)).toBe(true); // lựa chọn trùng
    expect(find(i, "DUP_KEY", "passage_questions", 10)).toBe(true);
    expect(i.some((x) => x.tab === "passage_questions" && x.row === 11)).toBe(false); // bài gốc lỗi: bỏ lặng lẽ
    expect(find(i, "TF_OPTIONS_IGNORED", "passage_questions", 12)).toBe(true);
    expect(find(i, "EMPTY_FIELD", "passage_questions", 13)).toBe(true);
  });

  it("dòng lỗi không lọt vào dữ liệu đã chuẩn hóa", async () => {
    const r = await run("sheet-bad");
    expect(r.data.passages.map((p) => p.key)).toEqual(["p:ok:1", "p:noq:1"]);
    expect(r.data.passageQuestions.map((q) => q.key)).toEqual(["q:1", "q:10"]);
    expect(r.data.passageQuestions.find((q) => q.key === "q:10")).toMatchObject({ kind: "tf", answer: 1, options: [] });
  });

  it("thiếu cột bắt buộc ở tab passages thì báo và bỏ qua câu hỏi (không báo dây chuyền)", async () => {
    const cfg = loadSheetConfig();
    const loaded = await loadContent(cfg, { fromDir: fixture("sheet-ok") });
    loaded.tabs.set("passages", parseTab("passages", "key,skill,level,title\np:x:1,reading,A1,T\n").tab);
    const r = validateContent(loaded.tabs, cfg);
    expect(find(r.issues, "MISSING_COLUMN", "passages", 1)).toBe(true);
    expect(r.issues.some((x) => x.tab === "passage_questions" && x.level === "error")).toBe(false);
    expect(r.data.passageQuestions).toHaveLength(0);
  });

  it("thiếu hai tab mới chỉ là cảnh báo (Sheet cũ vẫn nạp được)", async () => {
    const cfg = loadSheetConfig();
    const loaded = await loadContent(cfg, { fromDir: fixture("sheet-ok") });
    loaded.tabs.delete("passages");
    loaded.tabs.delete("passage_questions");
    const r = validateContent(loaded.tabs, cfg);
    expect(r.issues.filter((x) => x.level === "error")).toEqual([]);
    expect(find(r.issues, "MISSING_TAB", "passages")).toBe(true);
    expect(find(r.issues, "MISSING_TAB", "passage_questions")).toBe(true);
  });
});

describe("content/seed — bộ bài đọc/nghe mẫu", () => {
  async function seed() {
    const cfg = loadSheetConfig();
    const loaded = await loadContent(cfg, { fromDir: fixture("sheet-ok") });
    const read = (f: string) => readFileSync(path.join(__dirname, "..", "..", "content", "seed", f), "utf8");
    loaded.tabs.set("passages", parseTab("passages", read("passages.csv")).tab);
    loaded.tabs.set("passage_questions", parseTab("passage_questions", read("passage_questions.csv")).tab);
    return validateContent(loaded.tabs, cfg);
  }

  it("hợp lệ hoàn toàn và không có bài nào thiếu câu hỏi", async () => {
    const r = await seed();
    expect(r.issues.filter((i) => i.level === "error" || ["NO_QUESTIONS", "TF_OPTIONS_IGNORED"].includes(i.code))).toEqual([]);
    expect(r.data.passages).toHaveLength(10);
    expect(r.data.passageQuestions).toHaveLength(41);
  });

  it("mỗi cấp A1–C1 có đủ một bài đọc và một bài nghe, mỗi bài ≥ 4 câu, có cả mcq lẫn tf", async () => {
    const r = await seed();
    for (const level of ["A1", "A2", "B1", "B2", "C1"]) {
      for (const skill of ["reading", "listening"]) {
        const ps = r.data.passages.filter((p) => p.level === level && p.skill === skill);
        expect(ps, `${level} ${skill}`).toHaveLength(1);
        const qs = r.data.passageQuestions.filter((q) => q.passage === ps[0].key);
        expect(qs.length, ps[0].key).toBeGreaterThanOrEqual(4);
        expect(new Set(qs.map((q) => q.kind))).toEqual(new Set(["mcq", "tf"]));
      }
    }
  });

  it("đáp án đúng không dồn về một vị trí", async () => {
    const r = await seed();
    const positions = new Set(r.data.passageQuestions.filter((q) => q.kind === "mcq").map((q) => q.answer));
    expect(positions.size).toBeGreaterThanOrEqual(3);
  });
});
