import { FORGET_AFTER_BAD, INTERVALS, MASTERED_LEVEL, MAX_LEVEL } from "./rules";
import type { SrsState } from "./types";

const DAY_MS = 86_400_000;

/**
 * Trạng thái SRS mới của một từ sau một lần trả lời (mục 4.2, 5.2).
 *  - đúng: level + 1 (tối đa 5), bad = 0, chờ INTERVALS[level mới] ngày
 *  - sai khi chưa thuộc (level < 3): về level 0, hỏi lại ngay
 *  - sai khi đã thuộc: giữ "thuộc"; sai 3 lần liên tiếp mới quên (level 0); hỏi lại ngay
 */
export function nextSrsState(cur: SrsState | null, correct: boolean, now: Date): SrsState {
  let level = cur?.level ?? 0;
  let bad = cur?.bad ?? 0;

  if (correct) {
    level = Math.min(level + 1, MAX_LEVEL);
    bad = 0;
  } else if (level >= MASTERED_LEVEL) {
    bad += 1;
    if (bad >= FORGET_AFTER_BAD) {
      level = 0;
      bad = 0;
    }
  } else {
    level = 0;
    bad = 0;
  }

  const days = correct ? INTERVALS[level] : 0;
  return { level, bad, nextReview: new Date(now.getTime() + days * DAY_MS) };
}

/** Trạng thái hiển thị ở chế độ Học (mục 4.5). */
export type LearnState = "new" | "learned" | "due" | "mastered";

export function learnState(cur: Pick<SrsState, "level"> | null | undefined): LearnState {
  if (!cur) return "new";
  if (cur.level >= MASTERED_LEVEL) return "mastered";
  if (cur.level >= 1) return "learned";
  return "due"; // level 0: vừa sai khi chưa thuộc → "Cần ôn"
}

export function isDue(cur: SrsState, now: Date): boolean {
  return cur.nextReview.getTime() <= now.getTime();
}

/**
 * Bấm "Đã học" (mục 4.5): từ chưa có tiến độ hoặc đang level 0 → level 1, đến hạn ngay.
 * Trả null nếu không có gì thay đổi (level >= 1 giữ nguyên). Học không bao giờ đưa từ lên "thuộc".
 * Khớp hàm SQL mark_learned.
 */
export function markLearnedState(cur: SrsState | null, now: Date): SrsState | null {
  if (cur && cur.level >= 1) return null;
  return { level: 1, bad: 0, nextReview: now };
}
