import { describe, expect, it } from "vitest";
import { MAX_XP_LEVEL, XP_FIRST_STEP, growthRatio, xpLevelOf, xpStep, xpToReach } from "../../src/core/xpLevel";

describe("xpLevel — hệ số tăng", () => {
  it("xoay vòng theo chu kỳ 10 level: 2–4 → 1,08 · 5–7 → 1,10 · 8–11 → 1,12 · 12–14 → 1,08 …", () => {
    const at = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => growthRatio(a + i));
    expect(at(2, 4)).toEqual([1.08, 1.08, 1.08]);
    expect(at(5, 7)).toEqual([1.1, 1.1, 1.1]);
    expect(at(8, 11)).toEqual([1.12, 1.12, 1.12, 1.12]);
    expect(at(12, 14)).toEqual([1.08, 1.08, 1.08]);
    expect(at(15, 17)).toEqual([1.1, 1.1, 1.1]);
    expect(at(18, 21)).toEqual([1.12, 1.12, 1.12, 1.12]);
    expect(growthRatio(22)).toBe(1.08);
  });
});

describe("xpLevel — bảng XP", () => {
  it("level 1 → 2 cần đúng XP_FIRST_STEP (200)", () => {
    expect(XP_FIRST_STEP).toBe(200);
    expect(xpStep(1)).toBe(200);
    expect(xpToReach(1)).toBe(0);
    expect(xpToReach(2)).toBe(200);
  });

  it("các bước đầu theo hệ số, làm tròn tới 10", () => {
    // 200 · 1,08 = 216 → 220 · 1,08² = 233,28 → 230 · 1,08³ = 251,94 → 250 · ×1,1 = 277,1 → 280
    expect([1, 2, 3, 4, 5].map((n) => xpStep(n))).toEqual([200, 220, 230, 250, 280]);
    expect(xpToReach(5)).toBe(900);
  });

  it("MỖI level tốn nhiều XP hơn level trước (bước tăng nghiêm ngặt)", () => {
    for (let n = 2; n < MAX_XP_LEVEL; n++) expect(xpStep(n)!).toBeGreaterThan(xpStep(n - 1)!);
  });

  it("tích lũy khớp tổng các bước; level tối đa không có bước kế", () => {
    let sum = 0;
    for (let n = 1; n < MAX_XP_LEVEL; n++) {
      expect(xpToReach(n)).toBe(sum);
      sum += xpStep(n)!;
    }
    expect(xpToReach(MAX_XP_LEVEL)).toBe(sum);
    expect(xpStep(MAX_XP_LEVEL)).toBeNull();
  });

  it("level ngoài khoảng bị từ chối", () => {
    expect(() => xpToReach(0)).toThrow();
    expect(() => xpToReach(MAX_XP_LEVEL + 1)).toThrow();
    expect(xpStep(0)).toBeNull();
    expect(xpStep(1.5)).toBeNull();
  });
});

describe("xpLevelOf", () => {
  it("0 XP là level 1", () => {
    expect(xpLevelOf(0)).toMatchObject({ level: 1, into: 0, need: 200, toNext: 200, ratio: 0, maxed: false });
  });

  it("ranh giới: thiếu 1 XP chưa lên, đủ thì lên và tiến độ về 0", () => {
    expect(xpLevelOf(199)).toMatchObject({ level: 1, into: 199, toNext: 1 });
    expect(xpLevelOf(200)).toMatchObject({ level: 2, into: 0, need: 220, toNext: 220, ratio: 0 });
    expect(xpLevelOf(419).level).toBe(2);
    expect(xpLevelOf(420).level).toBe(3);
  });

  it("tiến độ trong level", () => {
    const r = xpLevelOf(310); // level 2 bắt đầu ở 200, bước 220 → into 110
    expect(r).toMatchObject({ level: 2, into: 110, need: 220, toNext: 110 });
    expect(r.ratio).toBeCloseTo(0.5);
  });

  it("đạt level tối đa thì dừng, XP dư không lên thêm", () => {
    const top = xpToReach(MAX_XP_LEVEL);
    expect(xpLevelOf(top - 1).level).toBe(MAX_XP_LEVEL - 1);
    expect(xpLevelOf(top)).toMatchObject({ level: MAX_XP_LEVEL, into: 0, need: null, toNext: 0, ratio: 1, maxed: true });
    expect(xpLevelOf(top + 1_000_000)).toMatchObject({ level: MAX_XP_LEVEL, into: 1_000_000, maxed: true });
  });

  it("XP âm, NaN, số lẻ không làm hỏng", () => {
    expect(xpLevelOf(-50).level).toBe(1);
    expect(xpLevelOf(Number.NaN).level).toBe(1);
    expect(xpLevelOf(Number.POSITIVE_INFINITY).level).toBe(1);
    expect(xpLevelOf(199.9).level).toBe(1);
  });

  it("level không giảm khi XP tăng", () => {
    let prev = 1;
    for (let xp = 0; xp <= xpToReach(MAX_XP_LEVEL) + 500; xp += 37) {
      const l = xpLevelOf(xp).level;
      expect(l).toBeGreaterThanOrEqual(prev);
      prev = l;
    }
  });
});
