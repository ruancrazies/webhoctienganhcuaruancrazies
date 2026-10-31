import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredAnswer } from "../../src/core/events";
import type { StoredItem } from "../../src/core/types";

/** Service xem lại kết quả với repo giả: kiểm tra phân quyền, trộn hai bảng, phân trang, bài cũ, hẹn ôn. */

const repo = vi.hoisted(() => ({
  listFinishedExams: vi.fn(),
  listFinishedPractices: vi.fn(),
  getFinishedExam: vi.fn(),
  getFinishedPractice: vi.fn(),
  scheduleReviewNow: vi.fn(),
  passagesByIds: vi.fn(),
  levelCounters: vi.fn(),
  levelPasses: vi.fn(),
}));
vi.mock("../../src/server/repo", () => repo);

import { getResultDetail, listResults, scheduleWrongWords } from "../../src/server/services/results";
import { setConfigForTest } from "../../src/server/config";

const ME = "11111111-1111-4111-8111-111111111111";
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scores = (total: number) => ({ total, vocab: total, grammar: total, reading: null, listening: null });
const row = (n: number, at: string, extra: object = {}) => ({ id: ID(n), finishedAtRaw: at, cefr: null, passed: null, scores: scores(0.5), hasAnswers: true, ...extra });
const exam = (n: number, at: string, cefr = "A1", extra: object = {}) => row(n, at, { cefr, passed: false, ...extra });

const ITEMS: StoredItem[] = [
  { qid: "q1", game: "quiz", prompt: "cat?", expected: "mèo", options: ["mèo", "chó"], part: "vocab", wordId: 1 },
  { qid: "q2", game: "type", prompt: "chó?", expected: "dog", part: "vocab", wordId: 2 },
  { qid: "q3", game: "grammar", prompt: "She ___ home", expected: "goes", part: "grammar", grammarId: 9 },
  { qid: "q4", game: "passage", prompt: "Why?", expected: "Vì mưa", part: "reading", passageId: 5 },
];
const ANSWERS: StoredAnswer[] = [
  { qid: "q1", value: "chó", correct: false, near: false },
  { qid: "q2", value: "dog", correct: true, near: false },
  { qid: "q3", value: "", correct: false, near: false },
  { qid: "q4", value: "Vì mưa", correct: true, near: false },
];
const detailRow = (extra: object = {}) => ({
  id: ID(1), cefr: "A1", passed: false, startedAt: new Date("2026-10-28T08:00:00Z"), finishedAt: new Date("2026-10-28T08:20:00Z"),
  scores: scores(0.5), items: ITEMS, answers: ANSWERS, ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  repo.listFinishedExams.mockResolvedValue([]);
  repo.listFinishedPractices.mockResolvedValue([]);
  repo.passagesByIds.mockResolvedValue([{ id: 5, key: "p", skill: "reading", level: "A1", title: "Rain", body: "It rains.", audio: null }]);
  repo.levelCounters.mockResolvedValue([]);
  repo.levelPasses.mockResolvedValue(new Set());
  repo.scheduleReviewNow.mockResolvedValue(0);
  setConfigForTest({
    levels: { examMinWords: { A1: 10, A2: 20, B1: 30, B2: 40, C1: 50 } },
    exam: { vocab: { total: 8, mix: { quiz: 8, cloze: 0, type: 0 } }, grammar: { total: 4 }, durationMinutes: 20, passTotal: 0.8, passPart: 0.7, cooldownMinutes: 60, maxAttemptsPerDay: 3 },
  });
});

describe("listResults", () => {
  it("trộn hai bảng, mới nhất trước, gắn loại bài; chỉ hỏi repo với đúng userId", async () => {
    repo.listFinishedExams.mockResolvedValue([exam(1, "2026-10-28T09:00:00.000000+00:00"), exam(2, "2026-10-26T09:00:00.000000+00:00")]);
    repo.listFinishedPractices.mockResolvedValue([row(3, "2026-10-27T09:00:00.000000+00:00")]);
    const r = await listResults(ME, { limit: 20 });
    expect(r.items.map((i) => [i.type, i.id])).toEqual([["exam", ID(1)], ["practice", ID(3)], ["exam", ID(2)]]);
    expect(r.nextCursor).toBeUndefined();
    expect(repo.listFinishedExams.mock.calls[0][0]).toBe(ME);
    expect(repo.listFinishedPractices.mock.calls[0][0]).toBe(ME);
  });

  it("hơn limit: cắt đúng limit và trả con trỏ ở dòng cuối của trang", async () => {
    repo.listFinishedExams.mockResolvedValue([exam(1, "2026-10-28T09:00:00.000001+00:00"), exam(2, "2026-10-27T09:00:00.000000+00:00")]);
    repo.listFinishedPractices.mockResolvedValue([row(3, "2026-10-28T09:00:00.000002+00:00")]);
    const r = await listResults(ME, { limit: 2 });
    expect(r.items.map((i) => i.id)).toEqual([ID(3), ID(1)]); // chỉ khác nhau ở microsecond
    expect(r.nextCursor).toBe(`2026-10-28T09:00:00.000001+00:00|${ID(1)}`);
    // mỗi bảng được hỏi limit+1 dòng để biết còn trang sau
    expect(repo.listFinishedExams.mock.calls[0][1].limit).toBe(3);
  });

  it("vừa đủ limit: không có trang sau", async () => {
    repo.listFinishedExams.mockResolvedValue([exam(1, "2026-10-28T09:00:00.000000+00:00"), exam(2, "2026-10-27T09:00:00.000000+00:00")]);
    expect((await listResults(ME, { limit: 2 })).nextCursor).toBeUndefined();
  });

  it("con trỏ hợp lệ được chuyển xuống repo; con trỏ bậy bị từ chối 400", async () => {
    const cursor = `2026-10-28T09:00:00.000001+00:00|${ID(1)}`;
    await listResults(ME, { limit: 5, cursor });
    expect(repo.listFinishedExams.mock.calls[0][1].before).toEqual({ finishedAt: "2026-10-28T09:00:00.000001+00:00", id: ID(1) });
    await expect(listResults(ME, { limit: 5, cursor: "bậy" })).rejects.toMatchObject({ status: 400, code: "BAD_REQUEST" });
  });

  it("lọc type=exam bỏ bảng kiểm tra; type=practice bỏ bảng thi", async () => {
    await listResults(ME, { limit: 5, type: "exam" });
    expect(repo.listFinishedPractices).not.toHaveBeenCalled();
    repo.listFinishedExams.mockClear();
    await listResults(ME, { limit: 5, type: "practice" });
    expect(repo.listFinishedExams).not.toHaveBeenCalled();
  });

  it("lọc theo cấp: chỉ bài thi (bài kiểm tra không có cấp)", async () => {
    await listResults(ME, { limit: 5, cefr: "B1" });
    expect(repo.listFinishedPractices).not.toHaveBeenCalled();
    expect(repo.listFinishedExams.mock.calls[0][1].cefr).toBe("B1");
  });

  it("bài cũ / hết giờ (không có answers): hasDetail=false nhưng vẫn có điểm; thời gian đổi về ISO", async () => {
    repo.listFinishedExams.mockResolvedValue([exam(1, "2026-10-28T09:00:00.123456+00:00", "A1", { hasAnswers: false })]);
    const [it] = (await listResults(ME, { limit: 5 })).items;
    expect(it).toMatchObject({ hasDetail: false, passed: false, cefr: "A1", finishedAt: "2026-10-28T09:00:00.123Z" });
    expect(it.scores.total).toBe(0.5);
  });

  it("bài kiểm tra thường xuyên: passed = null, cefr = null", async () => {
    repo.listFinishedPractices.mockResolvedValue([row(3, "2026-10-27T09:00:00+00:00")]);
    expect((await listResults(ME, { limit: 5 })).items[0]).toMatchObject({ type: "practice", passed: null, cefr: null });
  });
});

describe("getResultDetail", () => {
  it("dựng lại bài: đề, đáp án đã chọn, đáp án đúng, thống kê theo phần, đoạn văn, phần yếu", async () => {
    repo.getFinishedExam.mockResolvedValue(detailRow());
    const d = await getResultDetail(ME, { type: "exam", id: ID(1) });
    expect(repo.getFinishedExam).toHaveBeenCalledWith(ME, ID(1));
    expect(d.items.map((i) => [i.qid, i.correct, i.answered])).toEqual([["q1", false, true], ["q2", true, true], ["q3", false, false], ["q4", true, true]]);
    expect(d.items[0]).toMatchObject({ expected: "mèo", yourAnswer: "chó", options: ["mèo", "chó"] });
    expect(d.parts).toEqual([
      { part: "vocab", total: 2, correct: 1 },
      { part: "grammar", total: 1, correct: 0 },
      { part: "reading", total: 1, correct: 1 },
    ]);
    expect(d.weakPart).toBe("grammar");
    expect(d.wrongWords).toBe(1); // chỉ từ 1 (q1); q3 là ngữ pháp
    expect(d.passages).toEqual([{ id: 5, skill: "reading", title: "Rain", body: "It rains." }]);
    expect(d.passMarks).toEqual({ total: 0.8, part: 0.7 });
    expect(d).toMatchObject({ type: "exam", cefr: "A1", passed: false, studyCefr: "A1" });
  });

  it("bài kiểm tra thường xuyên: không có ngưỡng đạt; cấp luyện = cấp đang học", async () => {
    repo.getFinishedPractice.mockResolvedValue(detailRow({ cefr: null, passed: null }));
    repo.levelCounters.mockResolvedValue([]);
    const d = await getResultDetail(ME, { type: "practice", id: ID(1) });
    expect(d.passMarks).toBeNull();
    expect(d.passed).toBeNull();
    expect(d.studyCefr).toBe("A1"); // cấp A1 mở và chưa qua
  });

  it("bài không tồn tại / của người khác / chưa nộp (repo trả null): 404 giống nhau", async () => {
    repo.getFinishedExam.mockResolvedValue(null);
    repo.getFinishedPractice.mockResolvedValue(null);
    await expect(getResultDetail(ME, { type: "exam", id: ID(9) })).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    await expect(getResultDetail(ME, { type: "practice", id: ID(9) })).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("bài cũ (answers null): 409 NO_DETAIL, không lộ đề", async () => {
    repo.getFinishedExam.mockResolvedValue(detailRow({ answers: null }));
    await expect(getResultDetail(ME, { type: "exam", id: ID(1) })).rejects.toMatchObject({ status: 409, code: "NO_DETAIL" });
  });

  it("làm đúng hết: không có phần yếu", async () => {
    repo.getFinishedExam.mockResolvedValue(detailRow({ answers: ANSWERS.map((a) => ({ ...a, correct: true })) }));
    const d = await getResultDetail(ME, { type: "exam", id: ID(1) });
    expect(d.weakPart).toBeNull();
    expect(d.wrongWords).toBe(0);
  });
});

describe("scheduleWrongWords", () => {
  it("hẹn ôn đúng các từ sai của đúng người, trả số từ thực sự đổi", async () => {
    repo.getFinishedPractice.mockResolvedValue(detailRow({ cefr: null }));
    repo.scheduleReviewNow.mockResolvedValue(1);
    const r = await scheduleWrongWords(ME, { type: "practice", id: ID(1) }, { now: new Date("2026-10-28T10:00:00Z") });
    expect(r).toEqual({ wrongWords: 1, scheduled: 1 });
    expect(repo.scheduleReviewNow).toHaveBeenCalledWith(ME, [1], new Date("2026-10-28T10:00:00Z"));
  });

  it("bài của người khác: 404 và KHÔNG đụng vào lịch ôn", async () => {
    repo.getFinishedPractice.mockResolvedValue(null);
    await expect(scheduleWrongWords(ME, { type: "practice", id: ID(1) })).rejects.toMatchObject({ status: 404 });
    expect(repo.scheduleReviewNow).not.toHaveBeenCalled();
  });

  it("bài cũ không có answers: 409, không đụng lịch ôn", async () => {
    repo.getFinishedExam.mockResolvedValue(detailRow({ answers: null }));
    await expect(scheduleWrongWords(ME, { type: "exam", id: ID(1) })).rejects.toMatchObject({ status: 409, code: "NO_DETAIL" });
    expect(repo.scheduleReviewNow).not.toHaveBeenCalled();
  });
});
