import { describe, expect, it } from "vitest";
import { loadLevels } from "../../content/schema/config";
import { buildExamItems, scoreExam, type ExamConfig } from "../../src/core/exam";
import { gradeAll, reviewList, type GradedItem } from "../../src/core/grading";
import { passageIdsOf, passageItems, revealPassage, toClientPassage } from "../../src/core/passages";
import { toClientItems } from "../../src/core/questions";
import type { Passage, PassageBundle, PassageQ, StoredItem } from "../../src/core/types";
import { grammarQ, seeded, sentence, word } from "./helpers";

const cfg: ExamConfig = loadLevels().exam;

const passage = (id: number, skill: Passage["skill"], extra: Partial<Passage> = {}): Passage => ({
  id, key: `p:${id}`, skill, level: "A1", title: `Title ${id}`, body: `Line one.\nLine two ${id}.`, audio: null, ...extra,
});
const pq = (id: number, passageId: number, kind: PassageQ["kind"], options: string[], answer: number, sort: number): PassageQ => ({
  id, passageId, kind, question: `Question ${id}?`, options, answer, explanation: `Because ${id}`, sort,
});
const reading: PassageBundle = {
  passage: passage(1, "reading"),
  questions: [pq(12, 1, "tf", [], 2, 2), pq(11, 1, "mcq", ["In Hanoi", "In Hue", "In Da Nang"], 1, 1)], // cố ý để lệch thứ tự `sort`
};
const listening: PassageBundle = { passage: passage(2, "listening"), questions: [pq(21, 2, "mcq", ["Tea", "Coffee"], 2, 1)] };

const words = Array.from({ length: 40 }, (_, i) => word(i + 1, `word${i}`, `nghĩa ${i}`));
const grammar = Array.from({ length: 12 }, (_, i) => grammarQ(i + 1, `Q ${i} ___ x`, ["a", "b", "c"], 1 + (i % 3)));
const pools = {
  viDistractors: Object.fromEntries(words.map((w) => [w.id, ["x1", "x2", "x3", "x4"]])),
  enDistractors: Object.fromEntries(words.map((w) => [w.id, ["d1", "d2", "d3", "d4"]])),
  sentences: Object.fromEntries(words.map((w) => [w.id, [sentence(w.id * 10, `I like ${w.en} very much.`, "tôi thích")]])),
  grammarQuestions: grammar,
};

describe("passageItems", () => {
  it("bài đọc trước bài nghe, câu của một đoạn liền nhau theo `sort`", () => {
    const items = passageItems([listening, reading], seeded(1));
    expect(items.map((i) => [i.passageId, i.part])).toEqual([[1, "reading"], [1, "reading"], [2, "listening"]]);
    expect(items[0].prompt).toBe("Question 11?"); // sort 1 đứng trước sort 2
  });

  it("mcq: đáp án đúng nằm trong options đã xáo; tf: Đúng/Sai cố định", () => {
    const [mcq, tf] = passageItems([reading], seeded(7));
    expect(mcq.game).toBe("passage");
    expect(mcq.expected).toBe("In Hanoi");
    expect([...mcq.options!].sort()).toEqual(["In Da Nang", "In Hanoi", "In Hue"]);
    expect(tf.options).toEqual(["Đúng", "Sai"]);
    expect(tf.expected).toBe("Sai"); // answer 2
  });
});

describe("buildExamItems với bài đọc / nghe", () => {
  it("nối sau từ vựng + ngữ pháp, qid liên tục, không đổi số câu từ vựng / ngữ pháp", () => {
    const items = buildExamItems(words, { ...pools, passages: [listening, reading] }, cfg, seeded(3));
    expect(items).toHaveLength(30 + 3);
    expect(items.map((i) => i.qid)).toEqual(items.map((_, i) => `q${i + 1}`));
    expect(items.filter((i) => i.part === "vocab")).toHaveLength(20);
    expect(items.filter((i) => i.part === "grammar")).toHaveLength(10);
    expect(items.slice(30).map((i) => i.part)).toEqual(["reading", "reading", "listening"]);
    expect(passageIdsOf(items)).toEqual([1, 2]);
  });

  it("không truyền passages: đề y như cũ", () => {
    const items = buildExamItems(words, pools, cfg, seeded(3));
    expect(items).toHaveLength(30);
    expect(passageIdsOf(items)).toEqual([]);
  });
});

describe("gửi xuống trình duyệt", () => {
  it("câu hỏi có passageId nhưng không lộ đáp án", () => {
    const items = buildExamItems(words, { ...pools, passages: [reading] }, cfg, seeded(3));
    const client = toClientItems(items).filter((q) => q.game === "passage");
    expect(client.map((q) => q.passageId)).toEqual([1, 1]);
    expect(JSON.stringify(client)).not.toContain("expected");
  });

  it("bài đọc có text; bài nghe KHÔNG có text, dùng speech hoặc audioUrl", () => {
    expect(toClientPassage(reading.passage)).toEqual({ id: 1, skill: "reading", title: "Title 1", text: reading.passage.body });
    const tts = toClientPassage(listening.passage);
    expect(tts).toEqual({ id: 2, skill: "listening", title: "Title 2", speech: listening.passage.body });
    expect(tts).not.toHaveProperty("text");
    expect(toClientPassage({ ...listening.passage, audio: "https://cdn.example.com/a.mp3" })).toEqual({ id: 2, skill: "listening", title: "Title 2", audioUrl: "https://cdn.example.com/a.mp3" });
    // tên file (chưa có chỗ phục vụ) → quay về giọng đọc trình duyệt
    expect(toClientPassage({ ...listening.passage, audio: "cafe-1.mp3" })).toHaveProperty("speech");
  });

  it("sau khi nộp: lộ đủ lời thoại", () => {
    expect(revealPassage(listening.passage)).toEqual({ id: 2, skill: "listening", title: "Title 2", body: listening.passage.body });
  });
});

describe("chấm bài đọc / nghe", () => {
  const items = buildExamItems(words, { ...pools, passages: [reading, listening] }, cfg, seeded(5));

  it("trả lời đúng hết → đạt, có điểm đọc và nghe", () => {
    const graded = gradeAll(items, items.map((i) => ({ qid: i.qid, value: i.expected })));
    expect(graded.every((g) => g.correct)).toBe(true);
    expect(scoreExam(graded, cfg)).toEqual({ passed: true, total: 1, vocab: 1, grammar: 1, reading: 1, listening: 1 });
  });

  it("câu bỏ trống tính sai; đề không có phần đọc/nghe thì không có khóa reading/listening", () => {
    expect(scoreExam(gradeAll(items, []), cfg)).toMatchObject({ passed: false, total: 0, reading: 0, listening: 0 });
    const plain = buildExamItems(words, pools, cfg, seeded(5));
    expect(scoreExam(gradeAll(plain, []), cfg)).toEqual({ passed: false, total: 0, vocab: 0, grammar: 0 });
  });

  const mk = (part: StoredItem["part"], right: number, n: number): GradedItem[] =>
    Array.from({ length: n }, (_, i) => ({ item: { qid: `${part}${i}`, game: "quiz", prompt: "", expected: "", part } as StoredItem, correct: i < right }));

  it("bài nghe dưới ngưỡng phần thì trượt dù tổng ≥ 80%", () => {
    const g = [...mk("vocab", 20, 20), ...mk("grammar", 10, 10), ...mk("reading", 5, 5), ...mk("listening", 1, 3)];
    const r = scoreExam(g, cfg);
    expect(r.total).toBeGreaterThanOrEqual(0.8); // 36/38
    expect(r.listening).toBeCloseTo(1 / 3);
    expect(r.passed).toBe(false);
  });

  it("câu sai của bài đọc xuất hiện trong danh sách ôn, kèm passageId", () => {
    const graded = gradeAll(items, items.filter((i) => i.part !== "reading").map((i) => ({ qid: i.qid, value: i.expected })));
    const review = reviewList(graded);
    expect(review).toHaveLength(2);
    expect(review.every((r) => r.game === "passage" && r.passageId === 1)).toBe(true);
  });
});
