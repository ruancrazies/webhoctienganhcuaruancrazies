import { describe, expect, it } from "vitest";
import { loadLevels } from "../../content/schema/config";
import {
  attemptsLeft, buildExamItems, checkExamStart, examDeadline, isSubmitTooLate, scoreExam,
  type ExamConfig, type ExamGateInput,
} from "../../src/core/exam";
import { gradeAll, type GradedItem } from "../../src/core/grading";
import type { Cefr, LevelStatus, StoredItem } from "../../src/core/types";
import { at, grammarQ, seeded, sentence, word } from "./helpers";

const cfg: ExamConfig = loadLevels().exam;

const status = (extra: Partial<LevelStatus> = {}): LevelStatus => ({
  cefr: "A1", pass: false, unlocked: true, eligible: true, learnedCum: 1200, needLearned: 100, ...extra,
});
const gate = (extra: Partial<ExamGateInput> = {}) =>
  checkExamStart({ status: status(), attemptsToday: [], now: at("2026-10-24T05:00:00Z"), cfg, ...extra });

describe("cấu hình levels.yml khớp ExamConfig", () => {
  it("20 từ + 10 ngữ pháp, 20 phút, đạt 80%/70%, chờ 60 phút, 3 lượt/ngày", () => {
    expect(cfg).toMatchObject({
      vocab: { total: 20, mix: { quiz: 8, cloze: 6, type: 6 } }, grammar: { total: 10 },
      durationMinutes: 20, passTotal: 0.8, passPart: 0.7, cooldownMinutes: 60, maxAttemptsPerDay: 3,
    });
  });
});

describe("checkExamStart — điều kiện được thi", () => {
  it("đủ điều kiện → ok, chưa tốn lượt nào", () => {
    expect(gate()).toEqual({ ok: true, resume: false, attemptsLeft: 3 });
  });

  it("cấp chưa mở → LOCKED (không thi nhảy cấp)", () => {
    expect(gate({ status: status({ cefr: "B1", unlocked: false, eligible: false }) })).toMatchObject({ ok: false, code: "LOCKED" });
  });

  it("đã qua cấp → ALREADY_PASSED", () => {
    expect(gate({ status: status({ pass: true, eligible: false }) })).toMatchObject({ ok: false, code: "ALREADY_PASSED" });
  });

  it("chưa học đủ từ → NOT_ELIGIBLE kèm số từ còn thiếu", () => {
    const r = gate({ status: status({ eligible: false, learnedCum: 900, needLearned: 1000 }) });
    expect(r).toMatchObject({ ok: false, code: "NOT_ELIGIBLE", missingWords: 100 });
  });

  it("C2 không có bài thi → NO_EXAM", () => {
    expect(gate({ status: status({ cefr: "C2" }) })).toMatchObject({ ok: false, code: "NO_EXAM" });
  });

  it("thứ tự kiểm tra: chưa đủ điều kiện được báo trước giới hạn lượt", () => {
    const attemptsToday = [at("2026-10-24T01:00:00Z"), at("2026-10-24T02:00:00Z"), at("2026-10-24T03:00:00Z")];
    expect(gate({ attemptsToday, status: status({ eligible: false }) })).toMatchObject({ code: "NOT_ELIGIBLE" });
  });
});

describe("checkExamStart — bài đang dở", () => {
  const now = at("2026-10-24T05:00:00Z");

  it("còn hạn, cùng cấp → nhận lại bài đó, KHÔNG tốn lượt (kể cả khi đã hết lượt trong ngày)", () => {
    const open = { cefr: "A1" as Cefr, expiresAt: at("2026-10-24T05:10:00Z") };
    const three = [at("2026-10-24T01:00:00Z"), at("2026-10-24T02:00:00Z"), at("2026-10-24T03:00:00Z")];
    expect(gate({ open, now, attemptsToday: three })).toEqual({ ok: true, resume: true, attemptsLeft: 0 });
  });

  it("còn hạn nhưng là bài của cấp khác → OTHER_EXAM_OPEN", () => {
    const open = { cefr: "B2" as Cefr, expiresAt: at("2026-10-24T05:10:00Z") };
    expect(gate({ open, now })).toMatchObject({ ok: false, code: "OTHER_EXAM_OPEN" });
  });

  it("đã hết hạn thì bị bỏ qua (service phải đóng bài đó như một lượt trượt)", () => {
    const open = { cefr: "A1" as Cefr, expiresAt: at("2026-10-24T04:59:00Z") };
    expect(gate({ open, now })).toMatchObject({ ok: true, resume: false });
  });
});

describe("checkExamStart — 3 lượt/ngày (giờ VN) và giờ chờ 1 giờ", () => {
  it("lượt thứ 4 trong ngày bị chặn, báo thời điểm 00:00 VN kế tiếp", () => {
    const now = at("2026-10-24T09:00:00Z"); // 16:00 VN
    const attemptsToday = [at("2026-10-24T01:00:00Z"), at("2026-10-24T03:00:00Z"), at("2026-10-24T06:00:00Z")];
    const r = gate({ now, attemptsToday });
    expect(r).toMatchObject({ ok: false, code: "DAILY_LIMIT", attemptsLeft: 0 });
    expect(r.ok === false && r.nextAt?.toISOString()).toBe("2026-10-24T17:00:00.000Z");
  });

  it("qua nửa đêm giờ VN thì được thi lại: 3 lượt lúc 23:40–23:50 VN, đến 00:10 VN hôm sau còn đủ 3 lượt", () => {
    const attemptsToday = [at("2026-10-24T16:40:00Z"), at("2026-10-24T16:45:00Z"), at("2026-10-24T16:50:00Z")]; // 23:40–23:50 VN ngày 24
    const before = at("2026-10-24T16:55:00Z"); // 23:55 VN
    const after = at("2026-10-24T17:10:00Z"); //  00:10 VN ngày 25
    expect(gate({ now: before, attemptsToday })).toMatchObject({ ok: false, code: "DAILY_LIMIT" });
    expect(gate({ now: after, attemptsToday })).toEqual({ ok: true, resume: false, attemptsLeft: 3 });
  });

  it("lượt lúc 17:00 VN hôm qua (10:00 UTC) không tính cho 01:00 VN hôm nay dù cùng ngày UTC", () => {
    const attemptsToday = [at("2026-10-24T10:00:00Z"), at("2026-10-24T10:05:00Z"), at("2026-10-24T10:10:00Z")];
    expect(attemptsLeft(attemptsToday, at("2026-10-24T18:00:00Z"), cfg)).toBe(3); // 01:00 VN ngày 25
    expect(attemptsLeft(attemptsToday, at("2026-10-24T16:00:00Z"), cfg)).toBe(0); // 23:00 VN ngày 24
  });

  it("sau lượt trượt phải chờ đủ 1 giờ", () => {
    const failEnd = at("2026-10-24T05:00:00Z");
    const r = gate({ lastFailEndedAt: failEnd, now: at("2026-10-24T05:30:00Z"), attemptsToday: [at("2026-10-24T04:40:00Z")] });
    expect(r).toMatchObject({ ok: false, code: "COOLDOWN", attemptsLeft: 2 });
    expect(r.ok === false && r.nextAt?.toISOString()).toBe("2026-10-24T06:00:00.000Z");
  });

  it("đúng 60 phút trở đi thì được thi", () => {
    const failEnd = at("2026-10-24T05:00:00Z");
    expect(gate({ lastFailEndedAt: failEnd, now: at("2026-10-24T05:59:59Z") })).toMatchObject({ code: "COOLDOWN" });
    expect(gate({ lastFailEndedAt: failEnd, now: at("2026-10-24T06:00:00Z") })).toMatchObject({ ok: true });
  });

  it("giờ chờ có thể kéo qua nửa đêm và vẫn đúng", () => {
    const r = gate({ lastFailEndedAt: at("2026-10-24T16:30:00Z"), now: at("2026-10-24T17:10:00Z") });
    expect(r).toMatchObject({ ok: false, code: "COOLDOWN" });
  });
});

describe("hạn nộp", () => {
  it("examDeadline = bắt đầu + 20 phút", () => {
    expect(examDeadline(at("2026-10-24T05:00:00Z"), cfg).toISOString()).toBe("2026-10-24T05:20:00.000Z");
  });
  it("nộp trễ quá 30 giây sau hạn bị từ chối", () => {
    const exp = at("2026-10-24T05:20:00Z");
    expect(isSubmitTooLate(at("2026-10-24T05:20:30Z"), exp)).toBe(false);
    expect(isSubmitTooLate(at("2026-10-24T05:20:31Z"), exp)).toBe(true);
  });
});

// ---------- dựng đề ----------

const words = Array.from({ length: 40 }, (_, i) => word(i + 1, `word${i + 1}`, `nghĩa ${i + 1}`));
const viDistractors = Object.fromEntries(words.map((w) => [w.id, ["x1", "x2", "x3", "x4"]]));
const enDistractors = Object.fromEntries(words.map((w) => [w.id, ["alpha", "beta", "gamma"]]));
const sentences = Object.fromEntries(words.slice(0, 30).map((w) => [w.id, [sentence(w.id, `I really like ${w.en} a lot.`)]]));
const grammar = Array.from({ length: 25 }, (_, i) => grammarQ(i + 1, `Question ${i + 1} ___ here.`, ["opt a", "opt b", "opt c"], (i % 3) + 1, `giải thích ${i + 1}`));
const pools = { viDistractors, enDistractors, sentences, grammarQuestions: grammar };

describe("buildExamItems", () => {
  const items = buildExamItems(words, pools, cfg, seeded(42));
  const count = (f: (i: StoredItem) => boolean) => items.filter(f).length;

  it("20 câu từ vựng + 10 câu ngữ pháp, qid duy nhất", () => {
    expect(items).toHaveLength(30);
    expect(count((i) => i.part === "vocab")).toBe(20);
    expect(count((i) => i.part === "grammar")).toBe(10);
    expect(new Set(items.map((i) => i.qid)).size).toBe(30);
  });

  it("đúng cơ cấu quiz 8 / cloze 6 / gõ từ 6; không có listen", () => {
    expect(count((i) => i.game === "quiz")).toBe(8);
    expect(count((i) => i.game === "cloze")).toBe(6);
    expect(count((i) => i.game === "type")).toBe(6);
    expect(count((i) => i.game === "grammar")).toBe(10);
    expect(count((i) => i.game === "listen")).toBe(0);
  });

  it("gõ từ và cloze gõ: không gợi ý, strict (không chấp nhận gần đúng)", () => {
    for (const i of items.filter((x) => x.game === "type")) {
      expect(i.hint).toBeUndefined();
      expect(i.strict).toBe(true);
    }
  });

  it("mỗi từ chỉ xuất hiện một lần; thứ tự bị xáo (không xếp theo nhóm)", () => {
    const ids = items.filter((i) => i.wordId).map((i) => i.wordId);
    expect(new Set(ids).size).toBe(ids.length);
    const parts = items.map((i) => i.part);
    expect(parts.join(",")).not.toBe([...parts].sort().join(","));
  });

  it("câu hỏi gửi xuống client (không expected) vẫn chấm đúng khi trả lời đúng hết", () => {
    const answers = items.map((i) => ({ qid: i.qid, value: i.expected }));
    const graded = gradeAll(items, answers);
    expect(graded.every((g) => g.correct)).toBe(true);
    expect(scoreExam(graded, cfg)).toMatchObject({ passed: true, total: 1, vocab: 1, grammar: 1 });
  });

  it("từ không có câu ví dụ → cloze chuyển thành quiz, vẫn đủ 20 câu từ vựng", () => {
    const noSentences = buildExamItems(words, { ...pools, sentences: {} }, cfg, seeded(1));
    expect(noSentences.filter((i) => i.part === "vocab")).toHaveLength(20);
    expect(noSentences.filter((i) => i.game === "cloze")).toHaveLength(0);
    expect(noSentences.filter((i) => i.game === "quiz")).toHaveLength(14);
  });

  it("nội dung thiếu: trả ít câu hơn cấu hình thay vì lỗi", () => {
    const few = buildExamItems(words.slice(0, 5), { ...pools, grammarQuestions: grammar.slice(0, 3) }, cfg, seeded(1));
    expect(few.filter((i) => i.part === "vocab")).toHaveLength(5);
    expect(few.filter((i) => i.part === "grammar")).toHaveLength(3);
  });
});

// ---------- chấm đề ----------

describe("scoreExam", () => {
  const mk = (part: "vocab" | "grammar", right: number, n: number): GradedItem[] =>
    Array.from({ length: n }, (_, i) => ({
      item: { qid: `${part}${i}`, game: part === "vocab" ? "quiz" : "grammar", prompt: "", expected: "", part } as StoredItem,
      correct: i < right,
    }));
  const score = (vr: number, gr: number, vn = 20, gn = 10) => scoreExam([...mk("vocab", vr, vn), ...mk("grammar", gr, gn)], cfg);

  it("đạt đúng ngưỡng: tổng 24/30 = 80%, từ vựng 14/20 = 70%, ngữ pháp 10/10", () => {
    expect(score(14, 10)).toMatchObject({ passed: true, total: 0.8, vocab: 0.7, grammar: 1 });
  });

  it("tổng dưới 80% thì trượt dù mỗi phần ≥ 70%", () => {
    expect(score(16, 7)).toMatchObject({ passed: false }); // 23/30 = 76,7%; từ vựng 80%, ngữ pháp 70%
  });

  it("một phần dưới 70% thì trượt dù tổng ≥ 80%", () => {
    const r = score(20, 6); // tổng 26/30 = 86,7% nhưng ngữ pháp 60%
    expect(r.total).toBeGreaterThan(0.8);
    expect(r.passed).toBe(false);
    expect(score(13, 10).passed).toBe(false); // từ vựng 65%
  });

  it("câu bỏ trống tính là sai (đã được chấm là sai ở gradeAll)", () => {
    const items = buildExamItems(words, pools, cfg, seeded(3));
    const graded = gradeAll(items, []);
    expect(scoreExam(graded, cfg)).toEqual({ passed: false, total: 0, vocab: 0, grammar: 0 });
  });

  it("mẫu số là số câu thực có: đề ngắn vẫn có thể đạt; thiếu hẳn một phần thì không bao giờ đạt", () => {
    expect(score(8, 4, 10, 5).passed).toBe(true); // 12/15 = 80%, 80%, 80%
    expect(scoreExam(mk("vocab", 10, 10), cfg).passed).toBe(false);
  });
});
