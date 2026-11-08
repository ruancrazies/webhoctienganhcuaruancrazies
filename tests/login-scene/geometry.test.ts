import { describe, expect, it } from "vitest";
import { angleDiff, approach, clamp, coneLightsRect, hexA, pointInCone, type Cone } from "../../src/features/login-scene/engine/geometry";

const right: Cone = { x: 0, y: 0, angle: 0, spread: Math.PI / 3, length: 500 };

describe("geometry", () => {
  it("clamp và approach", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(5, 10, 3)).toBe(10); // vùng chứa hẹp hơn lề: ưu tiên cận dưới, không đảo
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(10, 0, 3)).toBe(7);
    expect(approach(9, 10, 3)).toBe(10); // không vượt quá đích
  });

  it("angleDiff chuẩn hoá qua ±π", () => {
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(-0.2, 6);
    expect(angleDiff(0.1, 0)).toBeCloseTo(0.1, 6);
  });

  it("pointInCone: trong tầm + trong góc", () => {
    expect(pointInCone(right, 100, 0)).toBe(true);
    expect(pointInCone(right, 100, 50)).toBe(true); // ~26.6° < 30°
    expect(pointInCone(right, 100, 80)).toBe(false); // ~38.7° > 30°
    expect(pointInCone(right, -100, 0)).toBe(false);
    expect(pointInCone(right, 600, 0)).toBe(false); // quá tầm
    expect(pointInCone(right, 0.2, 0.2)).toBe(true); // sát đầu đèn
  });

  it("pointInCone đúng khi chùm hướng gần ±π (quanh vết cắt atan2)", () => {
    const left: Cone = { ...right, angle: Math.PI };
    expect(pointInCone(left, -100, 10)).toBe(true);
    expect(pointInCone(left, -100, -10)).toBe(true);
    expect(pointInCone(left, 100, 0)).toBe(false);
  });

  it("coneLightsRect: cần ≥3/5 điểm; lướt qua mép không bật", () => {
    const field = { left: 200, top: -20, width: 300, height: 40 };
    expect(coneLightsRect(right, field)).toBe(true);
    // ô lệch hẳn xuống dưới ngoài góc
    expect(coneLightsRect(right, { left: 200, top: 400, width: 300, height: 40 })).toBe(false);
    // chỉ mép trái ô lọt vào chùm: dưới ngưỡng
    const tilted: Cone = { x: 0, y: -300, angle: Math.PI / 2 - 0.05, spread: 0.2, length: 500 };
    expect(coneLightsRect(tilted, { left: -2, top: 100, width: 300, height: 40 })).toBe(false);
  });

  it("hexA", () => {
    expect(hexA("#ffc266", 0.5)).toBe("rgba(255,194,102,0.5)");
  });
});
