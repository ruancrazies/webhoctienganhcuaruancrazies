import type { GameId } from "./types";

/**
 * Hằng số và bảng luật trò chơi (mục 4.1, 4.2). Chỉnh ở đây, không cần sửa logic.
 */

export type GameRule = {
  /** Có cập nhật SRS cho từng từ không. */
  srs: boolean;
  /** XP mỗi câu đúng. */
  xp: number;
  /** Số câu tối đa mỗi vòng. */
  cap: number;
  /** Số câu mặc định khi client không gửi n. */
  defaultN: number;
  /** Thời gian tối thiểu mỗi câu (giây) tính từ lúc bắt đầu vòng mới được nộp (chống bot). */
  minSecondsPerAnswer: number;
  /** Server có chấm đúng/sai không. false: flash/match — chỉ ghi nhận số thẻ/cặp hoàn thành. */
  graded: boolean;
  /** Chỉ chơi theo cấp (không theo chủ đề). */
  levelOnly?: boolean;
};

export const GAME_RULES: Record<GameId, GameRule> = {
  quiz:     { srs: true,  xp: 10, cap: 20, defaultN: 10, minSecondsPerAnswer: 1,   graded: true },
  blitz:    { srs: true,  xp: 4,  cap: 60, defaultN: 60, minSecondsPerAnswer: 0.7, graded: true, levelOnly: true },
  type:     { srs: true,  xp: 15, cap: 20, defaultN: 10, minSecondsPerAnswer: 1,   graded: true },
  scramble: { srs: true,  xp: 12, cap: 20, defaultN: 10, minSecondsPerAnswer: 1,   graded: true },
  cloze:    { srs: true,  xp: 12, cap: 20, defaultN: 10, minSecondsPerAnswer: 1,   graded: true },
  listen:   { srs: true,  xp: 12, cap: 20, defaultN: 10, minSecondsPerAnswer: 1,   graded: true },
  match:    { srs: false, xp: 6,  cap: 30, defaultN: 10, minSecondsPerAnswer: 1,   graded: false },
  flash:    { srs: false, xp: 3,  cap: 30, defaultN: 20, minSecondsPerAnswer: 1,   graded: false },
  build:    { srs: false, xp: 15, cap: 20, defaultN: 10, minSecondsPerAnswer: 1,   graded: true },
  tf:       { srs: false, xp: 8,  cap: 30, defaultN: 20, minSecondsPerAnswer: 1,   graded: true, levelOnly: true },
};

export function isGameId(x: unknown): x is GameId {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(GAME_RULES, x);
}

// ---- SRS (mục 4.2) ----
/** Số ngày chờ ôn lại theo level MỚI (sau khi trả lời đúng). */
export const INTERVALS = [0, 0, 0, 4, 7, 14] as const;
export const MAX_LEVEL = 5;
/** level >= 3 là "đã thuộc" (đúng 3 lần liên tiếp). */
export const MASTERED_LEVEL = 3;
/** Đã thuộc mà sai liên tiếp ngần này lần thì quên (về level 0). */
export const FORGET_AFTER_BAD = 3;

// ---- XP, chống cày (mục 4.1) ----
export const PERFECT_MIN_ITEMS = 5;
export const PERFECT_BONUS = 0.2;
export const ROUND_XP_CAP = 500;
export const DAILY_XP_CAP = 1500;
export const PLAY_START_PER_HOUR = 30;
export const PLAY_FINISH_PER_HOUR = 60;

// ---- Blitz ----
export const BLITZ_LIVES = 3;
export const BLITZ_BASE_POINTS = 10;
export const BLITZ_COMBO_STEP = 5;
export const BLITZ_MAX_MULTIPLIER = 4;

// ---- Bài thi ----
/** Nộp trễ quá ngần này giây sau hạn thì bị từ chối. */
export const EXAM_SUBMIT_GRACE_SECONDS = 30;
export const EXAM_START_PER_HOUR = 10;

/** Thời gian tối thiểu (giây) kể từ lúc bắt đầu vòng để được nộp `answerCount` câu. */
export function minRoundSeconds(rule: GameRule, answerCount: number): number {
  return rule.minSecondsPerAnswer * answerCount;
}

// ---- Bài kiểm tra thường xuyên (practice test) ----
/** Số từ đã học tối thiểu để có chất liệu ra đề. */
export const PRACTICE_MIN_WORDS = 20;
/** Lấy tối đa ngần này id từ đã học để bốc ngẫu nhiên ra đề. */
export const PRACTICE_POOL_MAX = 5000;
/** Phải trả lời ít nhất tỉ lệ này số câu thì mới tính cho nhiệm vụ "Làm một bài kiểm tra" (chống nộp bài trống để lấy thưởng). */
export const PRACTICE_QUEST_MIN_ANSWERED = 0.5;
export const PRACTICE_START_PER_HOUR = 30;
