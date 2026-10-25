import { describe, expect, it } from "vitest";
import type { GradedItem } from "../../src/core/grading";
import { answeredEnough, sample, wrongWordIds } from "../../src/core/practice";
import type { StoredItem } from "../../src/core/types";
import { seeded } from "./helpers";

const item = (qid: string, extra: Partial<StoredItem> = {}): StoredItem =>
  ({ qid, game: "quiz", prompt: "?", expected: "a", ...extra }) as StoredItem;
const g = (qid: string, correct: boolean, answered: boolean, extra: Partial<StoredItem> = {}): GradedItem => ({
  item: item(qid, extra),
  answer: answered ? { qid, value: "x" } : undefined,
  correct,
});

describe("sample", () => {
  it("lấy tối đa n phần tử khác nhau, không đổi mảng gốc", () => {
    const src = Array.from({ length: 30 }, (_, i) => i);
    const out = sample(src, 10, seeded(7));
    expect(out).toHaveLength(10);
    expect(new Set(out).size).toBe(10);
    expect(out.every((x) => src.includes(x))).toBe(true);
    expect(src).toHaveLength(30);
    expect(src[0]).toBe(0);
  });

  it("n lớn hơn số phần tử → lấy hết; n ≤ 0 → rỗng", () => {
    expect(sample([1, 2, 3], 10, seeded(1)).sort()).toEqual([1, 2, 3]);
    expect(sample([1, 2, 3], 0)).toEqual([]);
    expect(sample([1, 2, 3], -2)).toEqual([]);
  });
});

describe("wrongWordIds", () => {
  it("chỉ lấy từ vựng làm sai, mỗi từ một lần, bỏ câu đúng và ngữ pháp", () => {
    const graded = [
      g("1", false, true, { wordId: 10, part: "vocab" }),
      g("2", true, true, { wordId: 11, part: "vocab" }),
      g("3", false, false, { wordId: 12, part: "vocab" }), // bỏ trống = sai
      g("4", false, true, { part: "grammar" }),
      g("5", false, true, { wordId: 10, part: "vocab" }), // trùng từ 10
    ];
    expect(wrongWordIds(graded).sort()).toEqual([10, 12]);
  });

  it("không có câu sai → rỗng", () => {
    expect(wrongWordIds([g("1", true, true, { wordId: 1, part: "vocab" })])).toEqual([]);
  });
});

describe("answeredEnough", () => {
  const mk = (n: number, answered: number) => Array.from({ length: n }, (_, i) => g(String(i), true, i < answered));

  it("cần trả lời ít nhất một nửa số câu", () => {
    expect(answeredEnough(mk(30, 14))).toBe(false);
    expect(answeredEnough(mk(30, 15))).toBe(true);
    expect(answeredEnough(mk(30, 30))).toBe(true);
  });

  it("nộp bài trống hoặc đề rỗng thì không đủ", () => {
    expect(answeredEnough(mk(30, 0))).toBe(false);
    expect(answeredEnough([])).toBe(false);
  });

  it("đáp án toàn khoảng trắng không tính là đã trả lời", () => {
    const blank: GradedItem = { item: item("1"), answer: { qid: "1", value: "   " }, correct: false };
    expect(answeredEnough([blank])).toBe(false);
  });

  it("đề lẻ làm tròn lên", () => {
    expect(answeredEnough(mk(5, 2))).toBe(false);
    expect(answeredEnough(mk(5, 3))).toBe(true);
  });
});
