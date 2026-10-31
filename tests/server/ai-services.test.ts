import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { buildNextActions, computeInsights, type InsightEvent, type LiveSignals } from "../../src/core/insights";
import { buildLearnerSnapshot, snapshotToText, type LearnerSnapshot } from "../../src/core/snapshot";
import { dayNo } from "../../src/core/streak";
import type { LevelStatus } from "../../src/core/types";

/** Giai đoạn 3: learner snapshot, coach, giải thích lỗi và pet chat có ngữ cảnh — repo, Gemini và giới hạn tần suất đều giả. */

const repo = vi.hoisted(() => ({
  getUserInsights: vi.fn(),
  getProfile: vi.fn(),
  dueCount: vi.fn(),
  getCoachRow: vi.fn(),
  saveCoachRow: vi.fn(),
  getErrorExplanation: vi.fn(),
  saveErrorExplanation: vi.fn(),
  recordActivity: vi.fn(),
}));
vi.mock("../../src/server/repo", () => repo);
const levels = vi.hoisted(() => ({ getLevelStatuses: vi.fn() }));
vi.mock("../../src/server/services/levels", () => levels);
const gemini = vi.hoisted(() => ({ askGemini: vi.fn() }));
vi.mock("../../src/server/chat/gemini", () => gemini);
const rate = vi.hoisted(() => ({ hitRateLimit: vi.fn() }));
vi.mock("../../src/server/ratelimit", () => rate);
const results = vi.hoisted(() => ({ getReviewedItem: vi.fn() }));
vi.mock("../../src/server/services/results", () => results);

import { ServiceError } from "../../src/server/errors";
import { chatWithPet } from "../../src/server/services/chat";
import { getCoach } from "../../src/server/services/coach";
import { explainMistake } from "../../src/server/services/explain";
import { getLearnerSnapshot } from "../../src/server/services/learner";

const ME = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-28T05:00:00Z");
const TODAY = dayNo(NOW);
const ctx = { now: NOW };

const ev = (o: Partial<InsightEvent>): InsightEvent => ({
  game: "tf", part: "grammar", correct: true, hintUsed: false, responseMs: null, at: new Date(NOW.getTime() - 3_600_000), cefr: "B1", pos: null, domain: "general", grammarTopic: "tenses", ...o,
});
const storedMetrics = () =>
  computeInsights({
    now: NOW,
    events: Array.from({ length: 20 }, (_, i) => ev({ correct: i >= 12 })),
    rounds: [], sessions: [], exams: [], medians: {}, review: { due: 18, overdue2d: 0 },
  });
const status = (o: Partial<LevelStatus> = {}): LevelStatus => ({ cefr: "B1", unlocked: true, pass: false, eligible: false, needLearned: 100, learnedCum: 88, ...o }) as LevelStatus;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GEMINI_API_KEY = "test-key";
  repo.getUserInsights.mockResolvedValue({ data: storedMetrics(), updatedAt: NOW });
  repo.getProfile.mockResolvedValue({ streak: 4, bestStreak: 6, lastDay: TODAY - 1, username: "Alice_01" });
  repo.dueCount.mockResolvedValue(18);
  repo.getCoachRow.mockResolvedValue(null);
  repo.saveCoachRow.mockResolvedValue(undefined);
  repo.getErrorExplanation.mockResolvedValue(null);
  repo.saveErrorExplanation.mockResolvedValue(undefined);
  repo.recordActivity.mockResolvedValue("sid");
  levels.getLevelStatuses.mockResolvedValue([status()]);
  rate.hitRateLimit.mockResolvedValue(true);
  gemini.askGemini.mockResolvedValue("Bạn có 18 từ đến hạn ôn, ôn sớm giúp từ không bị quên nhé!");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { delete process.env.GEMINI_API_KEY; vi.useRealTimers(); });

describe("getLearnerSnapshot", () => {
  it("dựng từ hồ sơ đã lưu + tín hiệu tươi, KHÔNG gọi tính lại và không có tên người dùng", async () => {
    const s = (await getLearnerSnapshot(ME, ctx)) as LearnerSnapshot;
    expect(s.level).toMatchObject({ cefr: "B1", missingWords: 12 });
    expect(s.due).toBe(18);
    expect(s.streak).toBe(4);
    expect(s.actions.map((a) => a.reason)).toContain("due_backlog");
    expect(JSON.stringify(s)).not.toContain("Alice_01");
    expect(repo.getUserInsights).toHaveBeenCalledWith(ME);
  });

  it("người chưa có hồ sơ vẫn có snapshot (theo tín hiệu tươi)", async () => {
    repo.getUserInsights.mockResolvedValue(null);
    const s = (await getLearnerSnapshot(ME, ctx)) as LearnerSnapshot;
    expect(s.overall.n).toBe(0);
    expect(s.actions.map((a) => a.reason)).toContain("due_backlog");
  });

  it("lỗi ở bất kỳ truy vấn nào → null, không ném", async () => {
    repo.dueCount.mockRejectedValue(new Error("db down"));
    await expect(getLearnerSnapshot(ME, ctx)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it("không có hồ sơ người dùng → null", async () => {
    repo.getProfile.mockResolvedValue(null);
    await expect(getLearnerSnapshot(ME, ctx)).resolves.toBeNull();
  });
});

describe("getCoach", () => {
  it("viết lời nhắn bằng Gemini, kiểm tra, lưu cache theo ngày kèm dấu vân tay", async () => {
    const r = await getCoach(ME, true, ctx);
    expect(r).toEqual({ message: "Bạn có 18 từ đến hạn ôn, ôn sớm giúp từ không bị quên nhé!", source: "ai", day: TODAY });
    expect(repo.saveCoachRow).toHaveBeenCalledWith(ME, TODAY, expect.objectContaining({ source: "ai", message: r.message, fingerprint: expect.stringContaining("due_backlog") }));
    const [system, msgs, opts] = gemini.askGemini.mock.calls[0];
    expect(system).toContain("không thêm số mới");
    expect(msgs[0].text).toContain("18 từ đến hạn");
    expect(msgs[0].text).not.toContain("Alice_01");
    expect(opts).toMatchObject({ maxOutputTokens: 300 });
  });

  it("cache còn khớp bộ gợi ý → trả luôn, không gọi Gemini, không tốn hạn mức", async () => {
    const snap = (await getLearnerSnapshot(ME, ctx)) as LearnerSnapshot;
    const fp = (await import("../../src/core/snapshot")).actionsFingerprint(snap);
    repo.getCoachRow.mockResolvedValue({ message: "Lời nhắn cũ", source: "ai", fingerprint: fp });
    const r = await getCoach(ME, true, ctx);
    expect(r).toEqual({ message: "Lời nhắn cũ", source: "ai", day: TODAY });
    expect(gemini.askGemini).not.toHaveBeenCalled();
    expect(rate.hitRateLimit).not.toHaveBeenCalled();
  });

  it("gợi ý đã đổi trong ngày (dấu vân tay lệch) → viết lại", async () => {
    repo.getCoachRow.mockResolvedValue({ message: "Lời nhắn cũ", source: "ai", fingerprint: "streak_risk::" });
    const r = await getCoach(ME, true, ctx);
    expect(r.message).not.toBe("Lời nhắn cũ");
    expect(gemini.askGemini).toHaveBeenCalledTimes(1);
  });

  it("AI bịa số → bỏ, dùng câu theo luật, không cache", async () => {
    gemini.askGemini.mockResolvedValue("Bạn có 31 từ đến hạn ôn, vào ôn ngay nhé bạn!");
    const r = await getCoach(ME, true, ctx);
    expect(r.source).toBe("rule");
    expect(r.message).toContain("Giữ chuỗi ngày"); // streak_risk (ưu tiên 90) đứng trước due_backlog (80)
    expect(r.message).toContain("Chuỗi 4 ngày");
    expect(r.message).not.toContain("31");
    expect(repo.saveCoachRow).not.toHaveBeenCalled();
  });

  it("Gemini lỗi → câu theo luật, không ném", async () => {
    gemini.askGemini.mockRejectedValue(new ServiceError(502, "CHAT_FAILED", "x"));
    const r = await getCoach(ME, true, ctx);
    expect(r.source).toBe("rule");
    expect(r.message).toContain("Giữ chuỗi ngày");
  });

  it("hết hạn mức gọi trong ngày → câu theo luật, không gọi Gemini", async () => {
    rate.hitRateLimit.mockResolvedValue(false);
    const r = await getCoach(ME, true, ctx);
    expect(r.source).toBe("rule");
    expect(gemini.askGemini).not.toHaveBeenCalled();
  });

  it("người học tắt cá nhân hoá (ai=false) → không gửi gì sang Gemini", async () => {
    const r = await getCoach(ME, false, ctx);
    expect(r.source).toBe("rule");
    expect(gemini.askGemini).not.toHaveBeenCalled();
    expect(repo.getCoachRow).not.toHaveBeenCalled();
  });

  it("chưa cấu hình khoá Gemini → câu theo luật, không tốn hạn mức", async () => {
    delete process.env.GEMINI_API_KEY;
    const r = await getCoach(ME, true, ctx);
    expect(r.source).toBe("rule");
    expect(rate.hitRateLimit).not.toHaveBeenCalled();
  });

  it("lỗi đọc/ghi cache không làm hỏng lời nhắn", async () => {
    repo.getCoachRow.mockRejectedValue(new Error("db"));
    repo.saveCoachRow.mockRejectedValue(new Error("db"));
    const r = await getCoach(ME, true, ctx);
    expect(r.source).toBe("ai");
  });

  it("không dựng được snapshot → câu chung, không gọi Gemini", async () => {
    repo.getProfile.mockResolvedValue(null);
    const r = await getCoach(ME, true, ctx);
    expect(r.source).toBe("rule");
    expect(gemini.askGemini).not.toHaveBeenCalled();
  });

  it("không ghi activity_events (mở trang chủ không phải là học)", async () => {
    await getCoach(ME, true, ctx);
    expect(repo.recordActivity).not.toHaveBeenCalled();
  });
});

describe("chatWithPet có ngữ cảnh", () => {
  const req = { pet: "phoebe" as const, message: "Mình nên học gì?", history: [], personalize: true };

  it("personalize bật: system prompt có LEARNER_CONTEXT với số liệu thật, không có tên", async () => {
    gemini.askGemini.mockResolvedValue("Ôn từ nhé");
    await chatWithPet(req, ME);
    const system = gemini.askGemini.mock.calls[0][0] as string;
    expect(system).toContain("LEARNER_CONTEXT");
    expect(system).toContain("18 từ đến hạn");
    expect(system).not.toContain("Alice_01");
    expect(system).toContain("Phoebe"); // tính cách giữ nguyên
  });

  it("personalize tắt: không đọc dữ liệu học, không có ngữ cảnh", async () => {
    gemini.askGemini.mockResolvedValue("ok");
    await chatWithPet({ ...req, personalize: false }, ME);
    expect(gemini.askGemini.mock.calls[0][0]).not.toContain("LEARNER_CONTEXT");
    expect(repo.getUserInsights).not.toHaveBeenCalled();
  });

  it("dựng ngữ cảnh lỗi: pet vẫn trả lời như trước", async () => {
    repo.getProfile.mockRejectedValue(new Error("db down"));
    gemini.askGemini.mockResolvedValue("Chào bạn");
    await expect(chatWithPet(req, ME)).resolves.toEqual({ reply: "Chào bạn" });
    expect(gemini.askGemini.mock.calls[0][0]).not.toContain("LEARNER_CONTEXT");
  });

  it("vẫn giới hạn tần suất và chỉ ghi { pet } vào activity", async () => {
    gemini.askGemini.mockResolvedValue("ok");
    await chatWithPet(req, ME);
    expect(repo.recordActivity).toHaveBeenCalledWith(ME, "chat", { pet: "phoebe" });
    rate.hitRateLimit.mockResolvedValue(false);
    await expect(chatWithPet(req, ME)).rejects.toMatchObject({ status: 429 });
  });
});

describe("explainMistake", () => {
  const REF = { type: "practice" as const, id: "22222222-2222-4222-8222-222222222222" };
  const item = (o: object = {}) => ({
    qid: "q1", index: 1, part: "vocab", game: "quiz", prompt: "Nghĩa của \"abandon\" là gì?", options: ["từ bỏ", "mang đi"], expected: "từ bỏ", yourAnswer: "mang đi",
    answered: true, correct: false, near: false, en: "abandon", vi: "từ bỏ", ...o,
  });
  const TEXT = "Abandon nghĩa là từ bỏ hẳn một thứ gì đó; còn mang đi là carry away.";

  beforeEach(() => {
    results.getReviewedItem.mockResolvedValue(item());
    gemini.askGemini.mockResolvedValue(TEXT);
  });

  it("câu sai: hỏi Gemini, lưu cache dùng chung, trả source ai", async () => {
    const r = await explainMistake(ME, REF, "q1");
    expect(r).toEqual({ text: TEXT, source: "ai" });
    expect(results.getReviewedItem).toHaveBeenCalledWith(ME, REF, "q1");
    const key = repo.saveErrorExplanation.mock.calls[0][0] as string;
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain(ME);
    expect(gemini.askGemini.mock.calls[0][1][0].text).toContain("mang đi");
  });

  it("cùng lỗi lần sau (kể cả người khác): lấy từ cache, không gọi Gemini, không tốn hạn mức", async () => {
    repo.getErrorExplanation.mockResolvedValue("Giải thích đã có");
    const r = await explainMistake(ME, REF, "q1");
    expect(r).toEqual({ text: "Giải thích đã có", source: "cache" });
    expect(gemini.askGemini).not.toHaveBeenCalled();
    expect(rate.hitRateLimit).not.toHaveBeenCalled();
  });

  it("khoá cache giống nhau cho hai người cùng lỗi, khác nhau theo đáp án sai", async () => {
    await explainMistake(ME, REF, "q1");
    await explainMistake("99999999-9999-4999-8999-999999999999", REF, "q1");
    results.getReviewedItem.mockResolvedValue(item({ yourAnswer: "nhận" }));
    await explainMistake(ME, REF, "q1");
    const keys = repo.saveErrorExplanation.mock.calls.map((c) => c[0]);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("câu đã làm đúng → 400; câu bài đọc/nghe → 422; bài người khác → lỗi của getReviewedItem (404)", async () => {
    results.getReviewedItem.mockResolvedValue(item({ correct: true }));
    await expect(explainMistake(ME, REF, "q1")).rejects.toMatchObject({ status: 400, code: "NOT_WRONG" });
    results.getReviewedItem.mockResolvedValue(item({ game: "passage" }));
    await expect(explainMistake(ME, REF, "q1")).rejects.toMatchObject({ status: 422, code: "EXPLAIN_UNSUPPORTED" });
    results.getReviewedItem.mockRejectedValue(new ServiceError(404, "NOT_FOUND", "x"));
    await expect(explainMistake(ME, REF, "q1")).rejects.toMatchObject({ status: 404 });
    expect(gemini.askGemini).not.toHaveBeenCalled();
  });

  it("đáp án gõ quá dài: vẫn giải thích nhưng không ghi cache dùng chung", async () => {
    results.getReviewedItem.mockResolvedValue(item({ yourAnswer: "x".repeat(80) }));
    await explainMistake(ME, REF, "q1");
    expect(repo.getErrorExplanation).not.toHaveBeenCalled();
    expect(repo.saveErrorExplanation).not.toHaveBeenCalled();
  });

  it("hết hạn mức → 429; Gemini lỗi → lỗi của Gemini; câu trả lời không đạt → 502", async () => {
    rate.hitRateLimit.mockResolvedValue(false);
    await expect(explainMistake(ME, REF, "q1")).rejects.toMatchObject({ status: 429 });
    rate.hitRateLimit.mockResolvedValue(true);
    gemini.askGemini.mockRejectedValue(new ServiceError(502, "CHAT_FAILED", "x"));
    await expect(explainMistake(ME, REF, "q1")).rejects.toMatchObject({ code: "CHAT_FAILED" });
    gemini.askGemini.mockResolvedValue("Xem https://x.y");
    await expect(explainMistake(ME, REF, "q1")).rejects.toMatchObject({ status: 502, code: "EXPLAIN_FAILED" });
    expect(repo.saveErrorExplanation).not.toHaveBeenCalled();
  });

  it("có giải thích sẵn trong đề: Gemini lỗi thì trả giải thích sẵn", async () => {
    results.getReviewedItem.mockResolvedValue(item({ explanation: "Giải thích sẵn." }));
    gemini.askGemini.mockRejectedValue(new ServiceError(502, "CHAT_FAILED", "x"));
    await expect(explainMistake(ME, REF, "q1")).resolves.toEqual({ text: "Giải thích sẵn.", source: "rule" });
  });

  it("lỗi đọc/ghi cache không làm hỏng giải thích", async () => {
    repo.getErrorExplanation.mockRejectedValue(new Error("db"));
    repo.saveErrorExplanation.mockRejectedValue(new Error("db"));
    await expect(explainMistake(ME, REF, "q1")).resolves.toMatchObject({ source: "ai" });
  });
});

describe("snapshot dùng chung giữa chat và coach", () => {
  it("cùng một văn bản snapshot được dùng ở cả hai nơi", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); // chatWithPet dùng đồng hồ thật; cố định để so sánh với snapshot dựng ở NOW
    vi.setSystemTime(NOW);
    const snap = (await getLearnerSnapshot(ME, ctx)) as LearnerSnapshot;
    gemini.askGemini.mockResolvedValue("ok");
    await chatWithPet({ pet: "nuonuo", message: "hi", history: [], personalize: true }, ME);
    expect(gemini.askGemini.mock.calls[0][0]).toContain(snapshotToText(snap));
    vi.useRealTimers();
  });
});

// Không dùng, giữ để kiểm tra kiểu: LiveSignals và buildNextActions vẫn tương thích với snapshot.
void (null as unknown as LiveSignals | typeof buildNextActions | typeof buildLearnerSnapshot);
