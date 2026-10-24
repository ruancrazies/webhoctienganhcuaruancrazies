/** Chuỗi ngày theo giờ Việt Nam, UTC+7 (mục 4.4, 5.8). Khớp hàm SQL touch_streak. */

const VN_OFFSET_SEC = 7 * 3600;
const DAY_SEC = 86400;

/** Số thứ tự ngày theo giờ VN (ngày 0 = 1970-01-01 giờ VN). */
export function dayNo(now: Date | number): number {
  const ms = typeof now === "number" ? now : now.getTime();
  return Math.floor((ms / 1000 + VN_OFFSET_SEC) / DAY_SEC);
}

/** Thời điểm 00:00 giờ VN của ngày `day`, dạng Date (UTC). */
export function startOfDay(day: number): Date {
  return new Date((day * DAY_SEC - VN_OFFSET_SEC) * 1000);
}

/** 00:00 giờ VN của ngày chứa `now`. */
export function startOfVnDay(now: Date): Date {
  return startOfDay(dayNo(now));
}

/** 00:00 giờ VN của ngày kế tiếp. */
export function startOfNextVnDay(now: Date): Date {
  return startOfDay(dayNo(now) + 1);
}

export type StreakState = { lastDay: number | null; streak: number; bestStreak: number };

/** Ghi nhận hoạt động trong ngày `today`. */
export function touchStreak(p: StreakState, today: number): StreakState {
  if (p.lastDay === today) return p;
  const streak = p.lastDay === today - 1 ? p.streak + 1 : 1;
  return { lastDay: today, streak, bestStreak: Math.max(p.bestStreak, streak) };
}

/** Chuỗi để HIỂN THỊ: bỏ lỡ hơn một ngày thì về 0. */
export function displayStreak(p: StreakState, today: number): number {
  return p.lastDay !== null && p.lastDay >= today - 1 ? p.streak : 0;
}
