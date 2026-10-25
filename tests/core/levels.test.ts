import { describe, expect, it } from "vitest";
import { loadLevels } from "../../content/schema/config";
import { highestPassedLevel, levelStatus, statusOf } from "../../src/core/levels";
import type { Cefr, LevelCounters } from "../../src/core/types";

const cfg = loadLevels(); // A1 100 · A2 100 · B1 3000 · B2 3500 · C1 4100
const c = (cefr: Cefr, learned: number, total: number): LevelCounters => ({ cefr, learned, total });
const big = (learned: Partial<Record<Cefr, number>> = {}): LevelCounters[] =>
  (["A1", "A2", "B1", "B2", "C1", "C2"] as Cefr[]).map((x) => c(x, learned[x] ?? 0, 2000));
const passes = (...p: Cefr[]) => new Set<Cefr>(p);

describe("levelStatus — mở khóa", () => {
  it("A1 luôn mở; các cấp sau khóa khi chưa qua bài thi", () => {
    const s = levelStatus(big(), passes(), cfg);
    expect(s.map((x) => x.unlocked)).toEqual([true, false, false, false, false, false]);
  });

  it("học thật nhiều (kể cả 'thuộc') không mở cấp sau — chỉ bài thi mới mở", () => {
    const s = levelStatus(big({ A1: 2000, A2: 2000 }), passes(), cfg);
    expect(statusOf(s, "A2").unlocked).toBe(false);
  });

  it("qua A1 mở A2; qua tới B1 mở B2", () => {
    expect(statusOf(levelStatus(big(), passes("A1"), cfg), "A2").unlocked).toBe(true);
    const s = levelStatus(big(), passes("A1", "A2", "B1"), cfg);
    expect(s.map((x) => x.unlocked)).toEqual([true, true, true, true, false, false]);
  });

  it("không thi nhảy cấp: có 'qua A2' trong level_passes mà chưa qua A1 thì A2 vẫn khóa", () => {
    const s = levelStatus(big({ A1: 5000 }), passes("A2"), cfg);
    expect(statusOf(s, "A2").unlocked).toBe(false);
    expect(statusOf(s, "B1").unlocked).toBe(false);
    expect(statusOf(s, "A2").eligible).toBe(false);
  });

  it("qua cả C1 là hoàn thành lộ trình: C2 mở nhưng không có bài thi", () => {
    const all = passes("A1", "A2", "B1", "B2", "C1");
    const c2 = statusOf(levelStatus(big({ C2: 9999 }), all, cfg), "C2");
    expect(c2.unlocked).toBe(true);
    expect(c2.eligible).toBe(false);
    expect(statusOf(levelStatus(big(), passes("A1", "A2", "B1", "B2"), cfg), "C2").unlocked).toBe(false);
  });
});

describe("levelStatus — điều kiện được vào thi", () => {
  it("A1: đủ 100 từ đã học mới được thi (99 chưa)", () => {
    expect(statusOf(levelStatus(big({ A1: 99 }), passes(), cfg), "A1").eligible).toBe(false);
    const ok = statusOf(levelStatus(big({ A1: 100 }), passes(), cfg), "A1");
    expect(ok).toMatchObject({ eligible: true, needLearned: 100, learnedCum: 100 });
  });

  it("A2 cũng chỉ cần 100 từ (cộng dồn): đã qua A1 với ≥ 100 từ thì được thi A2 ngay", () => {
    const base = passes("A1");
    expect(statusOf(levelStatus(big({ A1: 99 }), base, cfg), "A2").eligible).toBe(false);
    expect(statusOf(levelStatus(big({ A1: 100 }), base, cfg), "A2")).toMatchObject({ eligible: true, learnedCum: 100, needLearned: 100 });
  });

  it("tính CỘNG DỒN từ A1: B1 cần 3.000 tổng cộng", () => {
    const base = passes("A1", "A2");
    expect(statusOf(levelStatus(big({ A1: 1200, A2: 1000, B1: 799 }), base, cfg), "B1").eligible).toBe(false);
    const ok = statusOf(levelStatus(big({ A1: 1200, A2: 1000, B1: 800 }), base, cfg), "B1");
    expect(ok).toMatchObject({ eligible: true, learnedCum: 3000, needLearned: 3000 });
  });

  it("ngưỡng tự hạ khi nội dung chưa đủ, để không bị kẹt", () => {
    const small = [c("A1", 60, 60), c("A2", 0, 0), c("B1", 0, 0), c("B2", 0, 0), c("C1", 0, 0), c("C2", 0, 0)];
    const s = statusOf(levelStatus(small, passes(), cfg), "A1");
    expect(s).toMatchObject({ needLearned: 60, eligible: true });
    const short = [c("A1", 59, 60)];
    expect(statusOf(levelStatus(short, passes(), cfg), "A1").eligible).toBe(false);
  });

  it("chưa có nội dung nào thì không ai được thi", () => {
    expect(statusOf(levelStatus([], passes(), cfg), "A1").eligible).toBe(false);
  });

  it("đã qua cấp thì không được thi lại; cấp bị khóa không được thi", () => {
    const s = levelStatus(big({ A1: 3000, A2: 3000 }), passes("A1"), cfg);
    expect(statusOf(s, "A1")).toMatchObject({ pass: true, eligible: false });
    expect(statusOf(s, "B1").eligible).toBe(false);
  });

  it("counters thiếu một cấp coi như 0 (A2 chưa có nội dung → ngưỡng hạ về tổng hiện có)", () => {
    const s = levelStatus([c("A1", 60, 60)], passes("A1"), cfg);
    expect(statusOf(s, "A2")).toMatchObject({ learnedCum: 60, needLearned: 60, eligible: true });
    // nhưng khi nội dung đủ lớn thì ngưỡng 100 có hiệu lực
    const s2 = levelStatus([c("A1", 60, 1000), c("A2", 0, 1500)], passes("A1"), cfg);
    expect(statusOf(s2, "A2")).toMatchObject({ needLearned: 100, eligible: false });
  });
});

describe("highestPassedLevel", () => {
  it("cấp cao nhất đã qua LIÊN TIẾP từ A1", () => {
    expect(highestPassedLevel(passes())).toBeNull();
    expect(highestPassedLevel(passes("A1"))).toBe("A1");
    expect(highestPassedLevel(passes("A1", "A2", "B2"))).toBe("A2");
    expect(highestPassedLevel(passes("A2"))).toBeNull();
    expect(highestPassedLevel(passes("A1", "A2", "B1", "B2", "C1"))).toBe("C1");
  });
});
