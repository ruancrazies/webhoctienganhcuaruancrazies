import { describe, expect, it } from "vitest";
import { DwellTracker } from "../../src/core/dwell";
import {
  clampResponseMs, eventCorrect, eventPart, eventText, EVENT_VALUE_MAX, RESPONSE_MS_MAX, toAnswerEvent, toAnswerEvents, toStoredAnswers,
} from "../../src/core/events";
import { gradeAll } from "../../src/core/grading";
import { passageItems } from "../../src/core/passages";
import { toClientItems } from "../../src/core/questions";
import type { Answer, StoredItem } from "../../src/core/types";
import { answerSchema } from "../../src/types/api";

const item = (qid: string, game: StoredItem["game"], expected: StoredItem["expected"], extra: Partial<StoredItem> = {}): StoredItem => ({
  qid, game, prompt: "p", expected, ...extra,
});
const ans = (qid: string, value: Answer["value"], extra: Partial<Answer> = {}): Answer => ({ qid, value, ...extra });

describe("clampResponseMs", () => {
  it("làm tròn và kẹp về 0–120.000", () => {
    expect(clampResponseMs(1234.6)).toBe(1235);
    expect(clampResponseMs(-50)).toBe(0);
    expect(clampResponseMs(5_000_000)).toBe(RESPONSE_MS_MAX);
  });
  it("không phải số hữu hạn → undefined (không có thông tin ≠ 0 ms)", () => {
    for (const v of [undefined, null, "12", NaN, Infinity]) expect(clampResponseMs(v)).toBeUndefined();
  });
});

describe("eventText", () => {
  it("mảng token nối bằng dấu cách; cắt ở EVENT_VALUE_MAX; không có → rỗng", () => {
    expect(eventText(["I", "am", "here"])).toBe("I am here");
    expect(eventText("x".repeat(500))).toHaveLength(EVENT_VALUE_MAX);
    expect(eventText(undefined)).toBe("");
  });
});

describe("eventPart", () => {
  it("bài thi đã gắn part thì dùng; vòng chơi: có grammarId → grammar, còn lại → vocab", () => {
    expect(eventPart(item("q1", "passage", "x", { part: "listening" }))).toBe("listening");
    expect(eventPart(item("q1", "tf", "true", { grammarId: 5 }))).toBe("grammar");
    expect(eventPart(item("q1", "quiz", "x", { wordId: 1 }))).toBe("vocab");
  });
});

describe("toAnswerEvent", () => {
  it("câu từ vựng đúng: đủ trường, response_ms được kẹp", () => {
    const [g] = gradeAll([item("q1", "quiz", "quả táo", { wordId: 7 })], [ans("q1", "quả táo", { responseMs: 999_999, attempts: 1 })]);
    expect(toAnswerEvent(g)).toEqual({
      qid: "q1", game: "quiz", part: "vocab", word_id: 7, correct: true, near: false, hint_used: false,
      attempts: 1, answer_value: "quả táo", expected: "quả táo", response_ms: RESPONSE_MS_MAX,
    });
  });

  it("câu sai / gõ gần đúng: ghi đáp án người dùng, near đúng", () => {
    const items = [item("q1", "type", "banana", { wordId: 1 }), item("q2", "type", "banana", { wordId: 2 })];
    const [wrong, near] = gradeAll(items, [ans("q1", "apple"), ans("q2", "bananna")]);
    expect(toAnswerEvent(wrong)).toMatchObject({ correct: false, near: false, answer_value: "apple", expected: "banana" });
    expect(toAnswerEvent(near)).toMatchObject({ correct: true, near: true, answer_value: "bananna" });
  });

  it("câu bỏ trống (bài thi): sai, answer_value rỗng, không có response_ms / attempts", () => {
    const [g] = gradeAll([item("q1", "grammar", "is", { grammarId: 3, part: "grammar" })], []);
    const e = toAnswerEvent(g);
    expect(e).toMatchObject({ correct: false, answer_value: "", expected: "is", grammar_id: 3, part: "grammar" });
    expect(e).not.toHaveProperty("response_ms");
    expect(e).not.toHaveProperty("attempts");
  });

  it("câu của bài đọc mang passage_id và passage_question_id", () => {
    const [g] = gradeAll([item("q1", "passage", "Tea", { passageId: 9, passageQuestionId: 91, part: "reading" })], [ans("q1", "Tea")]);
    expect(toAnswerEvent(g)).toMatchObject({ passage_id: 9, passage_question_id: 91, part: "reading", correct: true });
  });

  it("đáp án dạng mảng (build) được nối thành chuỗi", () => {
    const [g] = gradeAll([item("q1", "build", ["I", "run"], { wordId: 1 })], [ans("q1", ["I", "run"])]);
    expect(toAnswerEvent(g)).toMatchObject({ correct: true, answer_value: "I run", expected: "I run" });
  });
});

describe("eventCorrect: flash / match không có chấm của server", () => {
  const graded = (game: "flash" | "match", attempts?: number) =>
    gradeAll([item("q1", game, "back", { wordId: 1 })], [ans("q1", game === "flash" ? "known" : "ok", { attempts })])[0];

  it("chỉ đúng khi nhớ/ghép ngay lần đầu (attempts = 0)", () => {
    expect(eventCorrect(graded("flash", 0))).toBe(true);
    expect(eventCorrect(graded("flash"))).toBe(true);
    expect(eventCorrect(graded("flash", 1))).toBe(false);
    expect(eventCorrect(graded("match", 0))).toBe(true);
    expect(eventCorrect(graded("match", 2))).toBe(false);
  });
  it("trò có chấm: đúng bằng kết quả chấm, attempts không ảnh hưởng", () => {
    const [g] = gradeAll([item("q1", "quiz", "x", { wordId: 1 })], [ans("q1", "x", { attempts: 3 })]);
    expect(eventCorrect(g)).toBe(true);
  });
});

describe("toAnswerEvents / toStoredAnswers", () => {
  const items = [item("q1", "quiz", "a", { wordId: 1 }), item("q2", "type", "banana", { wordId: 2 }), item("q3", "quiz", "c", { wordId: 3 })];
  const graded = gradeAll(items, [ans("q1", "a"), ans("q2", "bananna")]); // q3 bỏ trống

  it("mỗi câu một sự kiện, giữ thứ tự đề", () => {
    expect(toAnswerEvents(graded).map((e) => [e.qid, e.correct])).toEqual([["q1", true], ["q2", true], ["q3", false]]);
  });
  it("bài làm lưu cả câu bỏ trống và đóng băng correct/near", () => {
    expect(toStoredAnswers(graded)).toEqual([
      { qid: "q1", value: "a", correct: true, near: false },
      { qid: "q2", value: "bananna", correct: true, near: true },
      { qid: "q3", value: "", correct: false, near: false },
    ]);
  });
});

describe("passageQuestionId", () => {
  it("passageItems ghi id câu hỏi, và toClientItems không đưa trường này xuống trình duyệt", () => {
    const bundle = {
      passage: { id: 1, key: "p1", skill: "reading" as const, level: "A1" as const, title: "T", body: "B" },
      questions: [{ id: 42, passageId: 1, kind: "tf" as const, question: "Q?", options: [], answer: 1, sort: 1 }],
    };
    const [it] = passageItems([bundle], () => 0.5);
    expect(it.passageQuestionId).toBe(42);
    expect(toClientItems([{ ...it, qid: "q1" }])[0]).not.toHaveProperty("passageQuestionId");
  });
});

describe("answerSchema.responseMs", () => {
  it("tùy chọn; số nguyên không âm", () => {
    expect(answerSchema.safeParse({ qid: "q1", value: "x" }).success).toBe(true);
    expect(answerSchema.safeParse({ qid: "q1", value: "x", responseMs: 1500 }).success).toBe(true);
    expect(answerSchema.safeParse({ qid: "q1", value: "x", responseMs: -1 }).success).toBe(false);
    expect(answerSchema.safeParse({ qid: "q1", value: "x", responseMs: 1.5 }).success).toBe(false);
  });
  it("giá trị lớn (tab treo) vẫn được nhận để không chặn việc nộp bài — server kẹp lại", () => {
    expect(answerSchema.safeParse({ qid: "q1", value: "x", responseMs: 600_000 }).success).toBe(true);
  });
});

describe("DwellTracker", () => {
  const make = () => {
    let t = 1000;
    const tr = new DwellTracker(() => t);
    return { tr, tick: (ms: number) => { t += ms; } };
  };

  it("đo thời gian câu đang hiện", () => {
    const { tr, tick } = make();
    tr.show("q1");
    tick(1500);
    expect(tr.ms("q1")).toBe(1500);
  });
  it("chuyển câu thì câu trước dừng; quay lại thì cộng dồn", () => {
    const { tr, tick } = make();
    tr.show("q1"); tick(2000);
    tr.show("q2"); tick(500);
    tr.show("q1"); tick(1000);
    expect(tr.ms("q1")).toBe(3000);
    expect(tr.ms("q2")).toBe(500);
  });
  it("ẩn tab thì dừng, hiện lại thì chạy tiếp (không tính thời gian bỏ tab)", () => {
    const { tr, tick } = make();
    tr.show("q1"); tick(1000);
    tr.setVisible(false); tick(60_000);
    tr.setVisible(true); tick(500);
    expect(tr.ms("q1")).toBe(1500);
  });
  it("câu chưa từng hiện → undefined; câu hiện lúc tab ẩn không đếm", () => {
    const { tr, tick } = make();
    expect(tr.ms("q9")).toBeUndefined();
    tr.setVisible(false);
    tr.show("q1"); tick(5000);
    expect(tr.ms("q1")).toBe(0);
  });
  it("kẹp ở 120.000 ms", () => {
    const { tr, tick } = make();
    tr.show("q1"); tick(900_000);
    expect(tr.ms("q1")).toBe(RESPONSE_MS_MAX);
  });
  it("show(null): không câu nào chạy", () => {
    const { tr, tick } = make();
    tr.show("q1"); tick(100);
    tr.show(null); tick(10_000);
    expect(tr.ms("q1")).toBe(100);
  });
});
