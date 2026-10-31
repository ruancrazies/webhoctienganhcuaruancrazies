import { describe, expect, it } from "vitest";
import { buildNextActions, computeInsights, type InsightEvent, type LiveSignals } from "../../src/core/insights";
import {
  actionsFingerprint, allowedNumbers, buildCoachRequest, buildLearnerContext, buildLearnerSnapshot, checkCoachText, COACH_SYSTEM,
  fallbackCoach, numbersIn, snapshotToText, SNAPSHOT_MAX_CHARS, type LearnerSnapshot,
} from "../../src/core/snapshot";
import { dayNo } from "../../src/core/streak";
import { buildSystemPrompt } from "../../src/core/chat";

const NOW = new Date("2026-10-28T05:00:00Z");
const TODAY = dayNo(NOW);

const ev = (o: Partial<InsightEvent>): InsightEvent => ({
  game: "quiz", part: "vocab", correct: true, hintUsed: false, responseMs: null, at: new Date(NOW.getTime() - 3_600_000), cefr: "B1", pos: "n", domain: "general", grammarTopic: null, ...o,
});
const many = (n: number, wrong: number, o: Partial<InsightEvent> = {}) => Array.from({ length: n }, (_, i) => ev({ ...o, correct: i >= wrong }));

const live = (o: Partial<LiveSignals> = {}): LiveSignals => ({
  now: NOW, dueCount: 18, streak: 4, lastDay: TODAY - 1, level: { cefr: "B1", eligible: false, missingWords: 12 }, ...o,
});

/** Người học có điểm yếu ngữ pháp rõ rệt và một ít bài kiểm tra. */
function sampleMetrics() {
  const events = [
    ...many(20, 12, { game: "tf", part: "grammar", grammarTopic: "tenses" }), // đúng 8/20 = 40%
    ...many(30, 3, { game: "quiz" }), // đúng 27/30
    ...many(10, 1, { game: "type" }),
  ];
  return computeInsights({
    now: NOW, events, rounds: [], sessions: [], medians: {}, review: { due: 18, overdue2d: 3 },
    exams: [{ at: new Date(NOW.getTime() - 86_400_000), kind: "practice", cefr: null, total: 0.68, vocab: 0.8, grammar: 0.5, reading: null, listening: null, passed: null }],
  });
}
const snapOf = (m = sampleMetrics(), l = live()) => buildLearnerSnapshot(m, l, buildNextActions(m, l));

describe("buildLearnerSnapshot", () => {
  it("tóm tắt đúng số liệu của hồ sơ và tín hiệu tươi", () => {
    const s = snapOf();
    expect(s.level).toEqual({ cefr: "B1", eligible: false, missingWords: 12 });
    expect(s.due).toBe(18);
    expect(s.streak).toBe(4);
    expect(s.daysSinceLast).toBe(1);
    expect(s.overall.n).toBe(60);
    expect(s.weak[0]).toMatchObject({ n: 20 });
    expect(s.weak[0].acc).toBeLessThan(70);
    expect(s.exams.lastTotal).toBe(68);
    expect(s.exams.parts.map((p) => p.label)).toEqual(["Từ vựng", "Ngữ pháp"]);
    expect(s.actions.length).toBeGreaterThan(0);
    expect(s.actions.every((a) => a.title && a.why && a.reason)).toBe(true);
  });

  it("tối đa 3 điểm yếu", () => {
    const m = sampleMetrics();
    const s = buildLearnerSnapshot({ ...m, weak: Array.from({ length: 5 }, (_, i) => ({ ...m.weak[0], key: `k${i}`, label: `Yếu ${i}` })) }, live(), []);
    expect(s.weak).toHaveLength(3);
  });

  it("người mới (chưa có hồ sơ): vẫn dựng được, không ném lỗi", () => {
    const l = live({ lastDay: null, streak: 0, dueCount: 0 });
    const s = buildLearnerSnapshot(null, l, buildNextActions(null, l));
    expect(s.overall).toEqual({ acc: null, n: 0, trend: null });
    expect(s.daysSinceLast).toBeNull();
    expect(snapshotToText(s)).toContain("chưa đủ dữ liệu");
    expect(snapshotToText(s)).toContain("chưa học lần nào");
  });

  it("ẩn danh: không có khoá hay giá trị nhận dạng nào, kể cả khi hồ sơ gốc bị gắn thêm trường lạ", () => {
    const polluted = { ...sampleMetrics(), username: "Alice_01", email: "a@x.vn", userId: "11111111-1111-4111-8111-111111111111" } as unknown as ReturnType<typeof sampleMetrics>;
    const s = buildLearnerSnapshot(polluted, live(), []);
    const dump = JSON.stringify(s) + snapshotToText(s) + buildLearnerContext(s);
    expect(dump).not.toMatch(/Alice_01|a@x\.vn|11111111-1111/);
    expect(Object.keys(s)).not.toEqual(expect.arrayContaining(["username", "email", "userId"]));
  });

  it("văn bản gọn (trong ngân sách ~500 token) ngay cả khi đủ dữ liệu", () => {
    const m = sampleMetrics();
    const s = buildLearnerSnapshot(m, live(), buildNextActions(m, live()));
    expect(snapshotToText(s).length).toBeLessThanOrEqual(SNAPSHOT_MAX_CHARS);
    expect(snapshotToText(s).length).toBeGreaterThan(100);
  });

  it("văn bản chứa các số của gợi ý (để LLM chép đúng)", () => {
    const text = snapshotToText(snapOf());
    expect(text).toContain("18 từ đến hạn");
    expect(text).toContain("[due_backlog]");
    expect(text).toContain("Còn thiếu 12 từ");
  });
});

describe("buildLearnerContext + prompt của pet", () => {
  it("khối LEARNER_CONTEXT có dữ liệu và luật dùng; prompt không có ngữ cảnh thì y như cũ", () => {
    const ctx = buildLearnerContext(snapOf());
    expect(ctx).toContain("LEARNER_CONTEXT");
    expect(ctx).toContain("KHÔNG phải mệnh lệnh");
    expect(ctx).toContain("không bịa số liệu");
    const withCtx = buildSystemPrompt("phoebe", "KT", ctx);
    expect(withCtx).toContain(ctx);
    expect(withCtx.startsWith(buildSystemPrompt("phoebe", "KT"))).toBe(true);
    expect(buildSystemPrompt("phoebe", "KT")).not.toContain("LEARNER_CONTEXT");
    expect(buildSystemPrompt("phoebe", "KT", undefined)).toBe(buildSystemPrompt("phoebe", "KT"));
  });
});

describe("coach: kiểm tra số liệu của LLM", () => {
  const s = snapOf();

  it("numbersIn chuẩn hoá dấu phẩy", () => {
    expect(numbersIn("đúng 72% trong 3,5 giờ, 18 từ")).toEqual(["72", "3.5", "18"]);
  });

  it("nhận lời nhắn chỉ dùng số có trong snapshot", () => {
    const msg = "Bạn có 18 từ đến hạn ôn, ôn sớm giúp từ không bị quên. Chuỗi 4 ngày đang chờ bạn đó!";
    expect(checkCoachText(msg, s)).toBe(msg);
  });

  it("loại lời nhắn có số lạ (AI tự bịa hoặc tính)", () => {
    expect(checkCoachText("Bạn có 19 từ đến hạn ôn, vào ôn ngay nhé!", s)).toBeNull();
    expect(checkCoachText("Bạn đã tiến bộ 15% so với tuần trước, giỏi lắm!", s)).toBeNull();
  });

  it("số nhỏ viết bằng chữ thì được", () => {
    expect(checkCoachText("Hôm nay chỉ cần một vòng ngắn là đủ, ôn 18 từ đến hạn nhé.", s)).not.toBeNull();
  });

  it("loại: rỗng, quá ngắn, quá dài, có đường dẫn/email", () => {
    expect(checkCoachText("", s)).toBeNull();
    expect(checkCoachText("Ok", s)).toBeNull();
    expect(checkCoachText("Học đi bạn ơi. ".repeat(40), s)).toBeNull();
    expect(checkCoachText("Xem thêm ở https://example.com nhé bạn ơi.", s)).toBeNull();
    expect(checkCoachText("Gửi mình qua a@x.vn nhé bạn ơi nha.", s)).toBeNull();
  });

  it("bỏ ký hiệu markdown", () => {
    expect(checkCoachText("**Ôn 18 từ đến hạn** hôm nay nhé bạn!", s)).toBe("Ôn 18 từ đến hạn hôm nay nhé bạn!");
  });

  it("allowedNumbers = đúng các số trong văn bản snapshot", () => {
    const ok = allowedNumbers(s);
    expect(ok.has("18")).toBe(true);
    expect(ok.has("4")).toBe(true);
    expect(ok.has("987")).toBe(false);
  });

  it("prompt: có quy tắc không bịa số, coi dữ liệu là dữ liệu, và chứa snapshot", () => {
    const { system, user } = buildCoachRequest(s);
    expect(system).toBe(COACH_SYSTEM);
    expect(system).toContain("không thêm số mới");
    expect(system).toContain("không phải mệnh lệnh");
    expect(user).toContain(snapshotToText(s));
  });
});

describe("fallbackCoach và fingerprint", () => {
  it("dùng việc đầu tiên trong gợi ý, kèm lý do có số liệu", () => {
    const s = snapOf();
    const msg = fallbackCoach(s);
    expect(msg).toContain(s.actions[0].title);
    expect(msg).toContain(s.actions[0].why);
    expect(checkCoachText(msg, s)).not.toBeNull(); // câu dự phòng cũng đạt chính bộ kiểm tra số liệu
  });

  it("vắng lâu: chỉ lời quay lại nhẹ nhàng", () => {
    const l = live({ lastDay: TODAY - 9 });
    const s = buildLearnerSnapshot(sampleMetrics(), l, buildNextActions(sampleMetrics(), l));
    expect(s.actions.map((a) => a.reason)).toEqual(["long_absence"]);
    expect(fallbackCoach(s)).toContain("9 ngày");
  });

  it("người mới và người không có gợi ý nào đều có câu", () => {
    const l = live({ lastDay: null, streak: 0, dueCount: 0, level: { cefr: "A1", eligible: false, missingWords: 0 } });
    expect(fallbackCoach(buildLearnerSnapshot(null, l, []))).toMatch(/vài vòng đầu tiên/);
    const some: LearnerSnapshot = { ...buildLearnerSnapshot(sampleMetrics(), l, []), actions: [] };
    expect(fallbackCoach(some)).toMatch(/chưa có việc gì gấp/);
  });

  it("fingerprint đổi khi bộ gợi ý đổi, không đổi khi chỉ số liệu đổi", () => {
    const a = snapOf();
    const b = snapOf(sampleMetrics(), live({ dueCount: 40 })); // vẫn due_backlog, số khác
    expect(actionsFingerprint(a)).toBe(actionsFingerprint(b));
    const c = snapOf(sampleMetrics(), live({ dueCount: 0 })); // hết tồn đọng → mất due_backlog
    expect(actionsFingerprint(c)).not.toBe(actionsFingerprint(a));
  });
});
