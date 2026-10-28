import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSheetConfig } from "../../content/schema/config";
import { parseTab } from "../../scripts/content/lib/csv";
import { adaptReading } from "../../scripts/content/lib/reading";
import { csvUrl, loadContent } from "../../scripts/content/lib/sheet";
import { validateContent } from "../../scripts/content/lib/validate";
import type { TabData } from "../../scripts/content/lib/types";

const fixture = (name: string) => path.join(__dirname, "..", "fixtures", name);

async function run(name: string) {
  const cfg = loadSheetConfig();
  const loaded = await loadContent(cfg, { fromDir: fixture(name) });
  const result = validateContent(loaded.tabs, cfg);
  return { ...result, issues: [...loaded.loadIssues, ...result.issues] };
}

describe("tab reading / reading_questions (cột riêng)", () => {
  it("gộp vào passages (skill = reading) và passage_questions, không lỗi", async () => {
    const r = await run("sheet-reading");
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
    const p = r.data.passages.find((x) => x.key === "r:t-001")!;
    expect(p.skill).toBe("reading");
    expect(p.level).toBe("B1");
    expect(p.source).toBe("OneStopEnglish corpus — CC BY-SA 4.0"); // license nối vào source
    expect(p.at.tab).toBe("reading"); // báo lỗi đúng tab gốc
    // bài của sheet-ok vẫn còn nguyên
    expect(r.data.passages.some((x) => x.key === "p:r:a1:1")).toBe(true);
  });

  it("đáp án mcq: chữ → số thứ tự, kể cả chữ toàn số (1949); số thứ tự giữ nguyên; tf bỏ options", async () => {
    const r = await run("sheet-reading");
    const q = (k: string) => r.data.passageQuestions.find((x) => x.key === k)!;
    expect(q("rq:t:1").answer).toBe(2); // "1949" là chữ của lựa chọn 2, không phải chỉ số 1949
    expect(q("rq:t:2").answer).toBe(2); // "2" không trùng chữ nào → số thứ tự 2
    expect(q("rq:t:3").kind).toBe("tf");
    expect(q("rq:t:3").answer).toBe(2); // FALSE
    expect(q("rq:t:3").options).toEqual([]);
    expect(r.issues.some((i) => i.code === "TF_OPTIONS_IGNORED")).toBe(false);
  });

  it("answer trùng cả chữ lẫn số thứ tự của cùng một lựa chọn thì không bị coi là mơ hồ", async () => {
    const r = await run("sheet-reading");
    // rq:t:4: options 1|2|3, answer "2" → chữ của lựa chọn 2 = số thứ tự 2: trùng nhau nên KHÔNG mơ hồ
    expect(r.issues.some((i) => i.code === "AMBIGUOUS_ANSWER" && i.row === 5)).toBe(false);
  });

  it("bài đọc chưa có câu hỏi chỉ bị cảnh báo NO_QUESTIONS", async () => {
    const r = await run("sheet-reading");
    expect(r.issues.some((i) => i.code === "NO_QUESTIONS" && i.tab === "reading")).toBe(true);
  });

  it("không có tab reading (sheet-ok) thì không đổi gì", async () => {
    const r = await run("sheet-ok");
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(r.data.passages.every((p) => p.at.tab === "passages")).toBe(true);
  });
});

describe("adaptReading — trường hợp biên", () => {
  const cfg = loadSheetConfig();
  const tab = (name: string, csv: string): [string, TabData] => [name, parseTab(name, csv).tab];

  it("tab reading bị Google thay bằng tab đầu tiên (sai cột) → bỏ qua, chỉ cảnh báo", () => {
    const tabs = new Map([tab("reading", "key,en,vi,pos\nfather:n:1,father,bố,n\n")]);
    const issues = adaptReading(tabs, cfg);
    expect(issues.map((i) => i.code)).toEqual(["READING_TAB_IGNORED"]);
    expect(tabs.has("passages")).toBe(false);
  });

  it("thiếu cột bắt buộc là lỗi", () => {
    const tabs = new Map([tab("reading", "key,title,text\nr:1,T,hello\n")]); // thiếu cefr
    const issues = adaptReading(tabs, cfg);
    expect(issues.some((i) => i.level === "error" && i.code === "MISSING_COLUMN")).toBe(true);
  });

  it("answer số trùng chữ của lựa chọn khác → AMBIGUOUS_ANSWER, hiểu là chữ", () => {
    const tabs = new Map([
      tab("reading", "key,title,cefr,text\nr:1,T,B1,hello\n"),
      tab("reading_questions", "key,passage,type,question,options,answer\nrq:1,r:1,mcq,Q?,3|1|2,2,\n"),
    ]);
    const issues = adaptReading(tabs, cfg);
    expect(issues.some((i) => i.code === "AMBIGUOUS_ANSWER")).toBe(true);
    expect(tabs.get("passage_questions")!.rows[0].v.answer).toBe("3"); // "2" là chữ của lựa chọn 3
  });
});

describe("csvUrl", () => {
  it("có gid → export (giữ nguyên giá trị ô); không gid → gviz với headers=1", () => {
    expect(csvUrl("ID", { name: "x", kind: "passageQuestions", gid: 123 })).toBe("https://docs.google.com/spreadsheets/d/ID/export?format=csv&gid=123");
    expect(csvUrl("ID", { name: "reading_questions", kind: "readingQuestions", gid: null })).toContain("gviz/tq?tqx=out:csv&headers=1&sheet=reading_questions");
  });
});
