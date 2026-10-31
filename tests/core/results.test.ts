import { describe, expect, it } from "vitest";
import type { StoredAnswer } from "../../src/core/events";
import {
  compareNewestFirst,
  decodeCursor,
  encodeCursor,
  filterReviewed,
  isBlankAnswer,
  micros,
  rebuildAttempt,
  tallyParts,
  weakestPart,
  wrongWordIdsOf,
} from "../../src/core/results";
import type { StoredItem } from "../../src/core/types";

const item = (qid: string, extra: Partial<StoredItem> = {}): StoredItem => ({ qid, game: "quiz", prompt: `Q ${qid}`, expected: "đúng", ...extra });
const ans = (qid: string, value: string | string[], correct: boolean, near = false): StoredAnswer => ({ qid, value, correct, near });

const ITEMS: StoredItem[] = [
  item("q1", { part: "vocab", wordId: 10, options: ["đúng", "sai"], meta: { en: "cat", vi: "mèo" } }),
  item("q2", { part: "vocab", wordId: 11, game: "type", expected: "book" }),
  item("q3", { part: "grammar", game: "grammar", grammarId: 5, explanation: "vì thì hiện tại" }),
  item("q4", { part: "reading", game: "passage", passageId: 7, passageQuestionId: 70 }),
  item("q5", { part: "vocab", wordId: 10, game: "cloze" }), // cùng từ q1 (từ xuất hiện hai lần)
  item("q6", { part: "listening", game: "passage", passageId: 8 }),
];
const ANSWERS: StoredAnswer[] = [
  ans("q1", "đúng", true),
  ans("q2", "bok", true, true), // đúng gần đúng
  ans("q3", "sai", false),
  ans("q4", "", false), // bỏ trống
  ans("q5", "x", false),
  ans("q6", "đúng", true),
];

describe("rebuildAttempt", () => {
  const r = rebuildAttempt(ITEMS, ANSWERS);

  it("giữ thứ tự đề, đánh số từ 1, ghép đáp án theo qid", () => {
    expect(r.map((x) => x.qid)).toEqual(["q1", "q2", "q3", "q4", "q5", "q6"]);
    expect(r.map((x) => x.index)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r[1]).toMatchObject({ yourAnswer: "bok", expected: "book", correct: true, near: true });
  });

  it("dùng kết quả chấm ĐÃ LƯU, không chấm lại (đáp án khác expected nhưng đã lưu đúng vẫn đúng)", () => {
    expect(r[1].correct).toBe(true); // 'bok' ≠ 'book' nhưng lúc nộp được tính là gần đúng
  });

  it("câu bỏ trống: answered=false, sai; câu có trả lời: answered=true", () => {
    expect(r[3]).toMatchObject({ yourAnswer: "", answered: false, correct: false });
    expect(r[0].answered).toBe(true);
  });

  it("mang theo nhãn phần, lựa chọn, giải thích, nghĩa của từ, id đoạn văn", () => {
    expect(r[0]).toMatchObject({ part: "vocab", options: ["đúng", "sai"], en: "cat", vi: "mèo", wordId: 10 });
    expect(r[2]).toMatchObject({ part: "grammar", explanation: "vì thì hiện tại" });
    expect(r[3]).toMatchObject({ part: "reading", passageId: 7 });
    expect(r[1].options).toBeUndefined();
  });

  it("câu không có trong answers (bất thường): coi là bỏ trống và sai", () => {
    const x = rebuildAttempt(ITEMS, ANSWERS.slice(0, 2));
    expect(x[2]).toMatchObject({ yourAnswer: "", answered: false, correct: false, near: false });
  });

  it("qid trùng trong answers: lấy câu đầu; qid lạ bị bỏ qua", () => {
    const x = rebuildAttempt([item("q1")], [ans("q1", "a", true), ans("q1", "b", false), ans("zz", "c", true)]);
    expect(x).toHaveLength(1);
    expect(x[0]).toMatchObject({ yourAnswer: "a", correct: true });
  });

  it("câu xếp câu (đáp án là mảng token) giữ nguyên dạng mảng", () => {
    const x = rebuildAttempt([item("q1", { game: "build", expected: ["I", "am"] })], [ans("q1", ["am", "I"], false)]);
    expect(x[0]).toMatchObject({ expected: ["I", "am"], yourAnswer: ["am", "I"], answered: true });
  });

  it("câu không có part (vòng chơi cũ): suy từ grammarId, còn lại là từ vựng", () => {
    const x = rebuildAttempt([item("a", { grammarId: 1 }), item("b", { wordId: 2 })], []);
    expect(x.map((i) => i.part)).toEqual(["grammar", "vocab"]);
  });
});

describe("isBlankAnswer", () => {
  it("rỗng, khoảng trắng, mảng toàn rỗng là bỏ trống", () => {
    expect(isBlankAnswer("")).toBe(true);
    expect(isBlankAnswer("  ")).toBe(true);
    expect(isBlankAnswer(["", " "])).toBe(true);
    expect(isBlankAnswer([])).toBe(true);
    expect(isBlankAnswer(undefined)).toBe(true);
    expect(isBlankAnswer("a")).toBe(false);
    expect(isBlankAnswer(["a"])).toBe(false);
  });
});

describe("tallyParts / weakestPart", () => {
  const r = rebuildAttempt(ITEMS, ANSWERS);
  it("đếm theo phần, thứ tự cố định, bỏ phần không có câu", () => {
    expect(tallyParts(r)).toEqual([
      { part: "vocab", total: 3, correct: 2 },
      { part: "grammar", total: 1, correct: 0 },
      { part: "reading", total: 1, correct: 0 },
      { part: "listening", total: 1, correct: 1 },
    ]);
    expect(tallyParts([])).toEqual([]);
  });
  it("phần yếu nhất = tỉ lệ đúng thấp nhất; hòa thì theo thứ tự vocab, grammar, reading, listening", () => {
    expect(weakestPart(tallyParts(r))).toBe("grammar"); // grammar 0/1 và reading 0/1 hòa → grammar đứng trước
    expect(weakestPart([{ part: "vocab", total: 4, correct: 3 }, { part: "listening", total: 2, correct: 1 }])).toBe("listening");
  });
  it("làm đúng hết (hoặc không có câu): không có phần yếu", () => {
    expect(weakestPart([{ part: "vocab", total: 3, correct: 3 }])).toBeNull();
    expect(weakestPart([])).toBeNull();
  });
});

describe("wrongWordIdsOf", () => {
  it("chỉ từ vựng làm sai, mỗi từ một lần; bỏ ngữ pháp / đọc / nghe", () => {
    // q1 đúng nhưng q5 (cùng từ 10) sai → từ 10 tính là sai (giống wrongWordIds của bài kiểm tra); q2 đúng gần đúng
    expect(wrongWordIdsOf(rebuildAttempt(ITEMS, ANSWERS))).toEqual([10]);
  });
  it("câu sai không có wordId thì bỏ qua", () => {
    expect(wrongWordIdsOf([{ part: "vocab", correct: false }])).toEqual([]);
  });
});

describe("filterReviewed", () => {
  const r = rebuildAttempt(ITEMS, ANSWERS);
  it("all / wrong / theo phần", () => {
    expect(filterReviewed(r, "all")).toHaveLength(6);
    expect(filterReviewed(r, "wrong").map((x) => x.qid)).toEqual(["q3", "q4", "q5"]);
    expect(filterReviewed(r, "vocab").map((x) => x.qid)).toEqual(["q1", "q2", "q5"]);
    expect(filterReviewed(r, "listening").map((x) => x.qid)).toEqual(["q6"]);
  });
});

describe("con trỏ phân trang", () => {
  const id = "0a1b2c3d-1111-4222-8333-444455556666";
  it("mã hóa rồi giải mã giữ nguyên microsecond", () => {
    const c = { finishedAt: "2026-10-28T09:37:12.123456+00:00", id };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });
  it("chấp nhận dạng không có phần thập phân, 'Z', hoặc dấu cách thay T", () => {
    expect(decodeCursor(`2026-10-28T09:37:12Z|${id}`)).not.toBeNull();
    expect(decodeCursor(`2026-10-28 09:37:12.5+07|${id}`)).not.toBeNull();
  });
  it("từ chối chuỗi bậy (chống nhét vào bộ lọc PostgREST)", () => {
    for (const bad of ["", "abc", `|${id}`, `2026-10-28T09:37:12Z|not-a-uuid`, `2026-10-28T09:37:12Z),id.gt.0,(x|${id}`, `x2026-10-28T09:37:12Z|${id}`, `2026-13-45T99:99:99Z|${id}`]) {
      expect(decodeCursor(bad)).toBeNull();
    }
  });
  it("micros đủ chính xác để phân định hai dòng cùng mili-giây", () => {
    expect(micros("2026-10-28T09:37:12.123456+00:00") - micros("2026-10-28T09:37:12.123455+00:00")).toBe(1);
    expect(micros("2026-10-28T09:37:12+00:00") % 1_000_000).toBe(0);
    expect(micros("2026-10-28T16:37:12.5+07:00")).toBe(micros("2026-10-28T09:37:12.500000+00:00"));
  });
  it("mới nhất trước; hòa thời điểm thì id lớn trước", () => {
    const a = { finishedAt: "2026-10-28T09:00:00.000002+00:00", id: "a" };
    const b = { finishedAt: "2026-10-28T09:00:00.000001+00:00", id: "b" };
    expect([b, a].sort(compareNewestFirst)).toEqual([a, b]);
    const t = "2026-10-28T09:00:00+00:00";
    expect([{ finishedAt: t, id: "1" }, { finishedAt: t, id: "2" }].sort(compareNewestFirst).map((x) => x.id)).toEqual(["2", "1"]);
  });
});
