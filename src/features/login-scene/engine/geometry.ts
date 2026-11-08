/** Hình học thuần của engine (không DOM) để test được. Toạ độ px, góc radian, 0 = sang phải, dương = xuống dưới. */
export type Cone = { x: number; y: number; angle: number; spread: number; length: number };
export type Rect = { left: number; top: number; width: number; height: number };

export const clamp = (v: number, lo: number, hi: number): number => (hi < lo ? lo : Math.min(hi, Math.max(lo, v)));

/** Hiệu hai góc, chuẩn hoá về (-π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export function pointInCone(c: Cone, px: number, py: number): boolean {
  const dx = px - c.x;
  const dy = py - c.y;
  const dist = Math.hypot(dx, dy);
  if (dist > c.length) return false;
  if (dist < 1) return true;
  return Math.abs(angleDiff(Math.atan2(dy, dx), c.angle)) <= c.spread / 2;
}

/**
 * Chùm sáng "chạm" ô nhập khi ít nhất 3 trong 5 điểm dọc giữa ô nằm trong hình quạt.
 * Ô mật khẩu rộng và thấp nên lấy điểm theo chiều ngang; 3/5 để quét lướt qua mép không bật nhầm.
 */
export function coneLightsRect(c: Cone, r: Rect): boolean {
  let hit = 0;
  for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) if (pointInCone(c, r.left + r.width * f, r.top + r.height / 2)) hit++;
  return hit >= 3;
}

/** Đi từ `cur` về `target` tối đa `step` (không vượt quá). */
export function approach(cur: number, target: number, step: number): number {
  const d = target - cur;
  return Math.abs(d) <= step ? target : cur + Math.sign(d) * step;
}

export const ROTATE_STEP = (Math.PI / 180) * 6;
export const MOVE_STEP = 14;
/** Khoảng cách từ tâm công cụ tới chấm tròn xoay. */
export const HANDLE_DIST = 58;

export function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}
