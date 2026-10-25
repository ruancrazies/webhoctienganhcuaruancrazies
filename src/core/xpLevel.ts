/**
 * Level người chơi, tính ra từ tổng XP (`profiles.xp`). KHÁC với cấp CEFR (A1–C2, xem levels.ts).
 * Không lưu trong DB: đổi công thức ở đây là mọi người được tính lại ngay, không cần migration.
 *
 * Số XP để đi từ level n lên n+1 gọi là "bước n". Bước 1 = XP_FIRST_STEP, các bước sau nhân thêm hệ số r:
 *   bước n = bước (n−1) × growthRatio(n)
 * growthRatio xoay vòng theo chu kỳ 10 level:
 *   level 2–4 → 1,08 · level 5–7 → 1,10 · level 8–11 → 1,12 · level 12–14 → 1,08 · level 15–17 → 1,10 · level 18–21 → 1,12 · …
 * (nghĩa là bước của level 1→4 tăng dần theo 1,08; 4→7 theo 1,10; 7→11 theo 1,12; 11→14 lại 1,08 …)
 * Mỗi bước được làm tròn tới XP_ROUND_TO để số hiển thị gọn; làm tròn không cộng dồn sai số.
 */

export const XP_FIRST_STEP = 200;
export const XP_ROUND_TO = 10;
/** Level tối đa hiện tại; nâng lên khi có thêm phần thưởng mở khóa. Đạt mức này thì không còn bước kế tiếp. */
export const MAX_XP_LEVEL = 50;

/** Hệ số nhân của bước n so với bước n−1 (n ≥ 2). */
export function growthRatio(n: number): number {
  const m = n % 10;
  if (m >= 2 && m <= 4) return 1.08;
  if (m >= 5 && m <= 7) return 1.1;
  return 1.12; // 8, 9, 0 (=10), 1 (=11)
}

/** STEPS[n] = XP cần để lên từ level n → n+1 (n = 1 … MAX−1). STEPS[0] không dùng. */
const STEPS: number[] = [0];
/** CUM[n] = tổng XP tích lũy tối thiểu để ĐẠT level n (CUM[1] = 0). */
const CUM: number[] = [0, 0];
{
  let raw = XP_FIRST_STEP;
  for (let n = 1; n < MAX_XP_LEVEL; n++) {
    if (n > 1) raw *= growthRatio(n);
    const step = Math.round(raw / XP_ROUND_TO) * XP_ROUND_TO;
    STEPS.push(step);
    CUM.push(CUM[n] + step);
  }
}

/** XP cần để đi từ `level` lên `level + 1`; null nếu đã ở level tối đa (hoặc level không hợp lệ). */
export function xpStep(level: number): number | null {
  return Number.isInteger(level) && level >= 1 && level < MAX_XP_LEVEL ? STEPS[level] : null;
}

/** Tổng XP tối thiểu để đạt `level` (1 ≤ level ≤ MAX_XP_LEVEL). */
export function xpToReach(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > MAX_XP_LEVEL) throw new Error(`Level không hợp lệ: ${level}`);
  return CUM[level];
}

export type XpLevel = {
  level: number;
  /** XP đã tích trong level hiện tại. */
  into: number;
  /** XP cần cho cả bước lên level kế; null nếu đã tối đa. */
  need: number | null;
  /** XP còn thiếu để lên level kế; 0 nếu đã tối đa. */
  toNext: number;
  /** Tỉ lệ tiến độ trong level hiện tại, 0…1 (tối đa thì 1). */
  ratio: number;
  maxed: boolean;
};

/** Level và tiến độ từ tổng XP. XP âm / không hợp lệ coi như 0. */
export function xpLevelOf(xp: number): XpLevel {
  const total = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let level = 1;
  while (level < MAX_XP_LEVEL && total >= CUM[level + 1]) level++;
  if (level >= MAX_XP_LEVEL) return { level, into: total - CUM[level], need: null, toNext: 0, ratio: 1, maxed: true };
  const need = STEPS[level];
  const into = total - CUM[level];
  return { level, into, need, toNext: need - into, ratio: into / need, maxed: false };
}
