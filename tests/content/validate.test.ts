import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSheetConfig, loadLevels } from "../../content/schema/config";
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
