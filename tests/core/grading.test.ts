import { describe, expect, it } from "vitest";
import {
  blitzScore, checkAnswer, computeRoundXp, dailyXpUsed, gradeAll, perWordResults, reviewList, submittedTooFast,
  type GradedItem,
} from "../../src/core/grading";
import { buildQuestions } from "../../src/core/questions";
import { GAME_RULES } from "../../src/core/rules";
import type { Answer, StoredItem } from "../../src/core/types";
import { grammarQ, seeded, sentence, word } from "./helpers";

const item = (game: StoredItem["game"], expected: StoredItem["expected"], extra: Partial<StoredItem> = {}): StoredItem => ({
  qid: "q1", game, prompt: "p", expected, ...extra,
});
const ans = (value: Answer["value"], extra: Partial<Answer> = {}): Answer => ({ qid: "q1", value, ...extra });

describe("checkAnswer", () => {
  it("không trả lời hoặc dùng gợi ý → sai", () => {
    expect(checkAnswer(item("quiz", "quả táo"), undefined).correct).toBe(false);
    expect(checkAnswer(item("quiz", "quả táo"), ans("quả táo", { hintUsed: true })).correct).toBe(false);
  });

  it("trắc nghiệm: so khớp chính xác, KHÔNG bỏ dấu tiếng Việt", () => {
    const q = item("quiz", "má");
    expect(checkAnswer(q, ans("má")).correct).toBe(true);
    expect(checkAnswer(q, ans("  má ")).correct).toBe(true);
    expect(checkAnswer(q, ans("ma")).correct).toBe(false);
    expect(checkAnswer(q, ans(["má"])).correct).toBe(false); // sai kiểu dữ liệu
    for (const g of ["blitz", "listen", "grammar"] as const) expect(checkAnswer(item(g, "x"), ans("x")).correct).toBe(true);
  });

  it("gõ từ: bỏ qua hoa/thường, dấu câu, khoảng trắng thừa", () => {
    const q = item("type", "ice cream");
    expect(checkAnswer(q, ans("  Ice   Cream. ")).correct).toBe(true);
  });

  it("gõ từ: gần đúng (sai 1 ký tự) được tính đúng kèm near; từ ngắn thì không", () => {
    expect(checkAnswer(item("type", "receive"), ans("recive"))).toEqual({ correct: true, near: true });
    expect(checkAnswer(item("type", "cat"), ans("cot")).correct).toBe(false);
    expect(checkAnswer(item("type", "apple"), ans("banana")).correct).toBe(false);
  });

  it("strict (bài thi): không chấp nhận gần đúng", () => {
    expect(checkAnswer(item("type", "receive", { strict: true }), ans("recive")).correct).toBe(false);
    expect(checkAnswer(item("cloze", "cooks", { strict: true }), ans("cook")).correct).toBe(false);
    expect(checkAnswer(item("type", "receive", { strict: true }), ans("Receive")).correct).toBe(true);
  });

  it("đáp án thay thế (đồng nghĩa) được chấp nhận", () => {
    const q = item("type", "big", { alts: ["large"] });
    expect(checkAnswer(q, ans("Large")).correct).toBe(true);
  });

  it("cloze dạng chọn so khớp chính xác; dạng gõ như type", () => {
    expect(checkAnswer(item("cloze", "apple", { options: ["apple", "pear"] }), ans("apple")).correct).toBe(true);
    expect(checkAnswer(item("cloze", "apple", { options: ["apple", "pear"] }), ans("pear")).correct).toBe(false);
    expect(checkAnswer(item("cloze", "cooks"), ans("Cooks")).correct).toBe(true);
  });

  it("scramble: bỏ khoảng trắng và hoa/thường", () => {
    const q = item("scramble", "ice cream");
    expect(checkAnswer(q, ans("icecream")).correct).toBe(true);
    expect(checkAnswer(q, ans("ice cream")).correct).toBe(true);
    expect(checkAnswer(q, ans("creamice")).correct).toBe(false);
  });

  it("build: mảng token ghép lại phải đúng thứ tự", () => {
    const q = item("build", ["She", "is", "reading", "a", "book."]);
    expect(checkAnswer(q, ans(["She", "is", "reading", "a", "book."])).correct).toBe(true);
    expect(checkAnswer(q, ans(["is", "She", "reading", "a", "book."])).correct).toBe(false);
    expect(checkAnswer(q, ans("She is reading a book.")).correct).toBe(false); // phải là mảng
  });

  it("tf", () => {
    expect(checkAnswer(item("tf", "true"), ans("true")).correct).toBe(true);
    expect(checkAnswer(item("tf", "true"), ans("false")).correct).toBe(false);
    expect(checkAnswer(item("tf", "false"), ans("False")).correct).toBe(true);
  });

  it("flash / match: không chấm, có nộp là hoàn thành", () => {
    expect(checkAnswer(item("flash", "x"), ans("done")).correct).toBe(true);
    expect(checkAnswer(item("match", "x"), ans("")).correct).toBe(false);
    expect(checkAnswer(item("match", "x"), undefined).correct).toBe(false);
  });
});

describe("gradeAll / perWordResults / reviewList", () => {
  const words = [word(1, "apple", "quả táo"), word(2, "cat", "con mèo")];
  const items = buildQuestions("type", words);

  it("chấm theo thứ tự câu hỏi; trùng qid lấy câu đầu; qid lạ bị bỏ", () => {
    const g = gradeAll(items, [
      { qid: "q1", value: "apple" },
      { qid: "q1", value: "WRONG" },
      { qid: "zzz", value: "cat" },
    ]);
    expect(g.map((x) => x.correct)).toEqual([true, false]);
    expect(g[1].answer).toBeUndefined();
  });

  it("mỗi từ tính một lần: đúng khi MỌI lượt của từ đều đúng", () => {
    const mk = (wordId: number, correct: boolean): GradedItem => ({ item: item("quiz", "x", { wordId }), correct });
    const r = perWordResults([mk(1, true), mk(1, false), mk(2, true), mk(2, true), { item: item("tf", "true"), correct: false }]);
    expect([...r]).toEqual([[1, false], [2, true]]);
  });

  it("reviewList chỉ gồm câu sai, kèm đáp án đúng và nghĩa", () => {
    const g = gradeAll(items, [{ qid: "q1", value: "apple" }, { qid: "q2", value: "dog" }]);
    const r = reviewList(g);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ qid: "q2", expected: "cat", yourAnswer: "dog", en: "cat", vi: "con mèo", wordId: 2 });
  });

  it("chấm được cả vòng dựng từ buildQuestions với từng trò", () => {
    const pools = {
      viDistractors: { 1: ["a", "b", "c"], 2: ["a", "b", "c"] },
      sentences: { 1: [sentence(1, "I eat an apple today.")] },
      enDistractors: { 1: ["pear", "plum"] },
      grammar: [grammarQ(1, "He ___ tea.", ["drink", "drinks"], 2)],
    };
    for (const game of ["quiz", "blitz", "listen", "type", "scramble", "cloze", "flash", "match", "build", "tf"] as const) {
      const built = buildQuestions(game, words, pools, { rng: seeded(9) });
      expect(built.length, game).toBeGreaterThan(0);
      const perfect: Answer[] = built.map((b) => ({
        qid: b.qid,
        value: game === "flash" || game === "match" ? "done" : (b.expected as string | string[]),
      }));
      expect(gradeAll(built, perfect).every((x) => x.correct), game).toBe(true);
      expect(gradeAll(built, []).every((x) => !x.correct), game).toBe(true);
    }
  });
});

describe("blitzScore", () => {
  const run = (pattern: string): number =>
    blitzScore([...pattern].map((ch) => ({ answer: ch === "_" ? undefined : ans("x"), correct: ch === "C" })));

  it("hệ số theo combo: 5 câu đầu ×1, câu 6 ×2", () => {
    expect(run("CCCCC")).toBe(50);
    expect(run("CCCCCC")).toBe(70);
  });

  it("combo tăng tới ×4 rồi giữ: 25 câu đúng liên tiếp", () => {
    // 5×10 + 5×20 + 5×30 + 5×40 + 5×40 = 700
    expect(run("C".repeat(25))).toBe(700);
  });

  it("sai: combo về 0 (mất hệ số) và mất 1 mạng", () => {
    expect(run("CCCCCXCC")).toBe(50 + 10 + 10); // sau câu sai, quay lại ×1
    expect(run("CCCCCCXC")).toBe(50 + 20 + 10);
  });

  it("hết 3 mạng thì bỏ các câu sau", () => {
    expect(run("CXXXCCCC")).toBe(10); // XXX = 3 mạng, các C sau không tính
    expect(run("CXXCCC")).toBe(40); // mới mất 2 mạng: C(10) + C(10) + C(10) + C(10), combo vừa bị reset nên vẫn ×1
  });

  it("dừng ở câu chưa trả lời (chưa tới)", () => {
    expect(run("CC_CCC")).toBe(20);
    expect(run("____")).toBe(0);
  });

  it("không dùng số điểm client gửi — chỉ phụ thuộc kết quả chấm", () => {
    const g = gradeAll(buildQuestions("blitz", [word(1, "a1", "x"), word(2, "b2", "y")], { viDistractors: { 1: ["m", "n"], 2: ["m", "n"] } }), [
      { qid: "q1", value: "x" }, { qid: "q2", value: "WRONG" },
    ]);
    expect(blitzScore(g)).toBe(10);
  });
});

describe("computeRoundXp", () => {
  const quiz = GAME_RULES.quiz;

  it("XP = đúng × XP/câu", () => {
    expect(computeRoundXp({ right: 7, total: 10, rule: quiz, dailyUsed: 0 })).toEqual({ xp: 70, perfect: false, capped: false });
  });

  it("đúng hết từ 5 câu: thưởng 20%", () => {
    expect(computeRoundXp({ right: 10, total: 10, rule: quiz, dailyUsed: 0 })).toEqual({ xp: 120, perfect: true, capped: false });
    expect(computeRoundXp({ right: 5, total: 5, rule: quiz, dailyUsed: 0 }).xp).toBe(60);
  });

  it("dưới 5 câu thì không có thưởng dù đúng hết", () => {
    expect(computeRoundXp({ right: 4, total: 4, rule: quiz, dailyUsed: 0 })).toEqual({ xp: 40, perfect: false, capped: false });
  });

  it("trần 500 XP mỗi vòng", () => {
    const r = computeRoundXp({ right: 30, total: 30, rule: GAME_RULES.type, dailyUsed: 0 }); // 450 + 20% = 540
    expect(r).toEqual({ xp: 500, perfect: true, capped: true });
  });

  it("trần 1.500 XP mỗi ngày, trừ phần đã nhận", () => {
    expect(computeRoundXp({ right: 10, total: 10, rule: quiz, dailyUsed: 1450 })).toMatchObject({ xp: 50, capped: true });
    expect(computeRoundXp({ right: 10, total: 10, rule: quiz, dailyUsed: 1500 }).xp).toBe(0);
    expect(computeRoundXp({ right: 10, total: 10, rule: quiz, dailyUsed: 1700 }).xp).toBe(0); // không âm
  });

  it("dailyXpUsed chỉ tính khi xp_day là hôm nay", () => {
    expect(dailyXpUsed(300, 100, 100)).toBe(300);
    expect(dailyXpUsed(300, 99, 100)).toBe(0);
    expect(dailyXpUsed(0, null, 100)).toBe(0);
  });

  it("submittedTooFast: >= 1 giây/câu, Blitz >= 0,7 giây/câu", () => {
    expect(submittedTooFast(9_999, GAME_RULES.quiz, 10)).toBe(true);
    expect(submittedTooFast(10_000, GAME_RULES.quiz, 10)).toBe(false);
    expect(submittedTooFast(41_000, GAME_RULES.blitz, 60)).toBe(true); // < 42 s
    expect(submittedTooFast(42_000, GAME_RULES.blitz, 60)).toBe(false);
  });
});
