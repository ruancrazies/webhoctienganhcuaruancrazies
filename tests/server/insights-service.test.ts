import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeInsights, type InsightEvent } from "../../src/core/insights";
import type { LevelStatus } from "../../src/core/types";
import { dayNo } from "../../src/core/streak";

/** Service hồ sơ năng lực với repo giả: làm mới, lỗi không lan ra, gợi ý, weak profile. */

const repo = vi.hoisted(() => ({
  recentAnswerEvents: vi.fn(),
  recentRounds: vi.fn(),
  recentSessions: vi.fn(),
  recentExamPoints: vi.fn(),
  dueCount: vi.fn(),
  overdueCount: vi.fn(),
  gameResponseMedians: vi.fn(),
  getUserInsights: vi.fn(),
  saveUserInsights: vi.fn(),
  getProfile: vi.fn(),
  recordActivity: vi.fn(),
}));
vi.mock("../../src/server/repo", () => repo);
const levels = vi.hoisted(() => ({ getLevelStatuses: vi.fn() }));
vi.mock("../../src/server/services/levels", () => levels);

import { logActivity } from "../../src/server/services/activity";
import {
  actionViews, computeUserInsights, getInsights, getStoredMetrics, getWeakProfile, homeActions, liveLevel, refreshInsightsSafe,
  refreshUserInsights, resetInsightsCacheForTest,
} from "../../src/server/services/insights";

const ME = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-28T05:00:00Z");
const TODAY = dayNo(NOW);
const ctx = { now: NOW };

const ev = (o: Partial<InsightEvent>): InsightEvent => ({
  game: "quiz", part: "vocab", correct: true, hintUsed: false, responseMs: null, at: new Date(NOW.getTime() - 3_600_000), cefr: "A1", pos: "n", domain: "general", grammarTopic: null, ...o,
});
const many = (n: number, wrong: number, o: Partial<InsightEvent> = {}) => Array.from({ length: n }, (_, i) => ev({ ...o, correct: i >= wrong }));

const status = (cefr: string, o: Partial<LevelStatus> = {}): LevelStatus =>
  ({ cefr, unlocked: true, pass: false, eligible: false, needLearned: 100, learnedCum: 40, ...o }) as LevelStatus;
const STATUSES = [status("A1"), status("A2", { unlocked: false }), status("B1", { unlocked: false })];

beforeEach(() => {
  vi.clearAllMocks();
  resetInsightsCacheForTest();
  repo.recentAnswerEvents.mockResolvedValue([]);
  repo.recentRounds.mockResolvedValue([]);
  repo.recentSessions.mockResolvedValue([]);
  repo.recentExamPoints.mockResolvedValue([]);
  repo.dueCount.mockResolvedValue(0);
  repo.overdueCount.mockResolvedValue(0);
  repo.gameResponseMedians.mockResolvedValue({});
  repo.getUserInsights.mockResolvedValue(null);
  repo.saveUserInsights.mockResolvedValue(undefined);
  repo.recordActivity.mockResolvedValue("sid");
  repo.getProfile.mockResolvedValue({ streak: 0, bestStreak: 0, lastDay: TODAY });
  levels.getLevelStatuses.mockResolvedValue(STATUSES);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("computeUserInsights / refreshUserInsights", () => {
  it("đọc dữ liệu thô của đúng người, cửa sổ 60 ngày, rồi tính", async () => {
    repo.recentAnswerEvents.mockResolvedValue(many(10, 4, { game: "type" }));
    repo.dueCount.mockResolvedValue(20);
    repo.overdueCount.mockResolvedValue(5);
    const m = await computeUserInsights(ME, ctx);
    expect(repo.recentAnswerEvents).toHaveBeenCalledWith(ME, new Date(NOW.getTime() - 60 * 86_400_000));
    expect(m.skills.find((s) => s.skill === "recall")).toMatchObject({ n: 10 });
    expect(m.behavior.overdueShare).toBe(0.25);
    expect(m.asOf).toBe(NOW.toISOString());
  });

  it("refresh: lưu đúng bản vừa tính", async () => {
    repo.recentAnswerEvents.mockResolvedValue(many(6, 0));
    const m = await refreshUserInsights(ME, ctx);
    expect(repo.saveUserInsights).toHaveBeenCalledWith(ME, m, NOW);
  });

  it("trung vị chung lỗi: vẫn tính được (chỉ thiếu tốc độ); thử lại sau ~1 phút chứ không gọi dồn dập", async () => {
    repo.gameResponseMedians.mockRejectedValue(new Error("rpc down"));
    repo.recentAnswerEvents.mockResolvedValue(many(10, 0, { responseMs: 3000 }));
    const m = await computeUserInsights(ME, ctx);
    expect(m.behavior.speedRatio).toBeNull();
    await computeUserInsights(ME, ctx);
    expect(repo.gameResponseMedians).toHaveBeenCalledTimes(1);
  });

  it("trung vị chung được dùng và nhớ 1 giờ", async () => {
    repo.gameResponseMedians.mockResolvedValue({ quiz: 1500 });
    repo.recentAnswerEvents.mockResolvedValue(many(6, 0, { responseMs: 3000 }));
    expect((await computeUserInsights(ME, ctx)).behavior.speedRatio).toBe(2);
    await computeUserInsights(ME, { now: new Date(NOW.getTime() + 30 * 60_000) });
    expect(repo.gameResponseMedians).toHaveBeenCalledTimes(1);
    await computeUserInsights(ME, { now: new Date(NOW.getTime() + 61 * 60_000) });
    expect(repo.gameResponseMedians).toHaveBeenCalledTimes(2);
  });

  it("refreshInsightsSafe: lỗi đọc hoặc lưu không ném ra", async () => {
    repo.recentAnswerEvents.mockRejectedValue(new Error("db down"));
    await expect(refreshInsightsSafe(ME, ctx)).resolves.toBeUndefined();
    repo.recentAnswerEvents.mockResolvedValue([]);
    repo.saveUserInsights.mockRejectedValue(new Error("write failed"));
    await expect(refreshInsightsSafe(ME, ctx)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("logActivity", () => {
  it("gọi record_activity", async () => {
    await logActivity(ME, "play/start", { game: "quiz" });
    expect(repo.recordActivity).toHaveBeenCalledWith(ME, "play/start", { game: "quiz" });
  });
  it("không bao giờ ném lỗi", async () => {
    repo.recordActivity.mockRejectedValue(new Error("rpc down"));
    await expect(logActivity(ME, "play/start")).resolves.toBeUndefined();
  });
});

describe("getWeakProfile / getStoredMetrics", () => {
  const stored = () => computeInsights({
    now: NOW, events: [...many(20, 12, { pos: "adj" })], rounds: [], sessions: [], exams: [], medians: {}, review: { due: 0, overdue2d: 0 },
  });

  it("đọc hồ sơ đã lưu thành nhóm yếu", async () => {
    repo.getUserInsights.mockResolvedValue({ data: JSON.parse(JSON.stringify(stored())), updatedAt: NOW });
    const p = await getWeakProfile(ME);
    expect(p.vocab.some((g) => g.pos === "adj" && g.cefr === "A1")).toBe(true);
  });
  it("chưa có / hỏng / lỗi DB → rỗng, không ném lỗi", async () => {
    expect(await getWeakProfile(ME)).toEqual({ vocab: [], grammar: [] });
    repo.getUserInsights.mockResolvedValue({ data: { v: 99 }, updatedAt: NOW });
    expect(await getWeakProfile(ME)).toEqual({ vocab: [], grammar: [] });
    expect(await getStoredMetrics(ME)).toBeNull();
    repo.getUserInsights.mockRejectedValue(new Error("db down"));
    expect(await getWeakProfile(ME)).toEqual({ vocab: [], grammar: [] });
  });
});

describe("liveLevel", () => {
  it("cấp đang học = cấp mở đầu tiên chưa qua, kèm số từ còn thiếu", () => {
    expect(liveLevel([status("A1", { pass: true }), status("A2", { needLearned: 200, learnedCum: 150 })])).toEqual({ cefr: "A2", eligible: false, missingWords: 50 });
    expect(liveLevel([status("A1", { eligible: true, learnedCum: 120 })])).toEqual({ cefr: "A1", eligible: true, missingWords: 0 });
  });
  it("qua hết các cấp có thi → C1", () => {
    expect(liveLevel([status("A1", { pass: true })])).toEqual({ cefr: "C1", eligible: false, missingWords: 0 });
  });
});

describe("homeActions", () => {
  const base = { now: NOW, profile: { streak: 0, bestStreak: 0, lastDay: TODAY as number | null }, dueCount: 0, statuses: STATUSES };

  it("người mới không dữ liệu: chỉ gợi ý theo tín hiệu tươi (còn thiếu từ để thi)", async () => {
    const a = await homeActions(ME, base);
    expect(a.map((x) => x.reason)).toEqual(["exam_gap"]);
    expect(a[0]).toMatchObject({ title: "Học thêm từ ở cấp A1", href: "/learn/A1" });
    expect(a[0].why).toContain("60 từ");
  });

  it("từ đến hạn nhiều → ôn; có chuỗi mà hôm nay chưa học → giữ chuỗi lên đầu", async () => {
    const a = await homeActions(ME, { ...base, dueCount: 30, profile: { streak: 6, bestStreak: 6, lastDay: TODAY - 1 } });
    expect(a.map((x) => x.reason)).toEqual(["streak_risk", "due_backlog", "exam_gap"]);
    expect(a[1]).toMatchObject({ href: "/level/A1" });
  });

  it("chuỗi đã đứt (bỏ lỡ hơn một ngày) thì không nhắc giữ chuỗi", async () => {
    const a = await homeActions(ME, { ...base, profile: { streak: 6, bestStreak: 6, lastDay: TODAY - 3 } });
    expect(a.map((x) => x.reason)).not.toContain("streak_risk");
  });

  it("dùng hồ sơ đã lưu: điểm yếu ngữ pháp", async () => {
    const m = computeInsights({
      now: NOW, events: many(20, 14, { game: "tf", part: "grammar", cefr: "A1", grammarTopic: "tenses", pos: null, domain: null }), rounds: [], sessions: [], exams: [], medians: {}, review: { due: 0, overdue2d: 0 },
    });
    repo.getUserInsights.mockResolvedValue({ data: JSON.parse(JSON.stringify(m)), updatedAt: NOW });
    const a = await homeActions(ME, base);
    expect(a[0]).toMatchObject({ reason: "weak_grammar_topic", title: "Luyện ngữ pháp: tenses", href: "/play/tf?cefr=A1" });
  });

  it("đọc hồ sơ lỗi: trang chủ vẫn có gợi ý theo tín hiệu tươi", async () => {
    repo.getUserInsights.mockRejectedValue(new Error("db down"));
    const a = await homeActions(ME, { ...base, dueCount: 40 });
    expect(a.map((x) => x.reason)).toContain("due_backlog");
  });

  it("không bao giờ nhiều hơn 3 gợi ý", async () => {
    const a = await homeActions(ME, { ...base, dueCount: 40, profile: { streak: 6, bestStreak: 6, lastDay: TODAY - 1 } });
    expect(a.length).toBeLessThanOrEqual(3);
  });
});

describe("getInsights (trang /insights)", () => {
  const storedAt = (t: Date) => ({ data: JSON.parse(JSON.stringify(computeInsights({ now: t, events: many(8, 2), rounds: [], sessions: [], exams: [], medians: {}, review: { due: 0, overdue2d: 0 } }))), updatedAt: t });

  it("chưa có hồ sơ: tính và lưu", async () => {
    repo.recentAnswerEvents.mockResolvedValue(many(8, 2));
    const r = await getInsights(ME, ctx);
    expect(repo.saveUserInsights).toHaveBeenCalledTimes(1);
    expect(r.metrics.samples).toBe(8);
    expect(r.level).toEqual({ cefr: "A1", eligible: false, missingWords: 60, learnedCum: 40 });
    expect(r.dueCount).toBe(0);
  });

  it("hồ sơ còn mới (dưới 6 giờ): dùng luôn, không đọc lại sự kiện", async () => {
    repo.getUserInsights.mockResolvedValue(storedAt(new Date(NOW.getTime() - 2 * 3_600_000)));
    await getInsights(ME, ctx);
    expect(repo.recentAnswerEvents).not.toHaveBeenCalled();
    expect(repo.saveUserInsights).not.toHaveBeenCalled();
  });

  it("hồ sơ cũ hơn 6 giờ: tính lại", async () => {
    repo.getUserInsights.mockResolvedValue(storedAt(new Date(NOW.getTime() - 7 * 3_600_000)));
    await getInsights(ME, ctx);
    expect(repo.recentAnswerEvents).toHaveBeenCalledTimes(1);
    expect(repo.saveUserInsights).toHaveBeenCalledTimes(1);
  });

  it("hồ sơ lưu bị hỏng: tính lại thay vì lỗi", async () => {
    repo.getUserInsights.mockResolvedValue({ data: { v: 1 }, updatedAt: NOW });
    await expect(getInsights(ME, ctx)).resolves.toBeTruthy();
    expect(repo.saveUserInsights).toHaveBeenCalledTimes(1);
  });

  it("thiếu hồ sơ người dùng → 404", async () => {
    repo.getProfile.mockResolvedValue(null);
    await expect(getInsights(ME, ctx)).rejects.toMatchObject({ status: 404 });
  });

  it("gợi ý dùng số từ đến hạn tươi", async () => {
    repo.getUserInsights.mockResolvedValue(storedAt(NOW));
    repo.dueCount.mockResolvedValue(25);
    const r = await getInsights(ME, ctx);
    expect(r.actions.map((a) => a.reason)).toContain("due_backlog");
    expect(r.dueCount).toBe(25);
  });
});

describe("actionViews", () => {
  it("gắn câu chữ và liên kết cho mỗi hành động", () => {
    const [a] = actionViews(null, { now: NOW, dueCount: 17, streak: 0, lastDay: TODAY, level: { cefr: "B1", eligible: false, missingWords: 0 } });
    expect(a).toEqual({ reason: "due_backlog", title: "Ôn các từ đến hạn", why: "Bạn có 17 từ đến hạn ôn. Ôn sớm giúp từ không bị quên.", href: "/level/B1" });
  });
});
