/** Hợp đồng dữ liệu dùng chung của lớp logic thuần (mục 5.1). Không phụ thuộc DB/HTTP. */

export type Cefr = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export const CEFR_ORDER: readonly Cefr[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
/** Các cấp có cổng (bài kiểm tra). C2 có từ nhưng không có bài thi (G4). */
export const GATED_LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const satisfies readonly Cefr[];

export type GameId = "quiz" | "blitz" | "type" | "scramble" | "cloze" | "listen" | "match" | "flash" | "build" | "tf";
/** Câu hỏi trong bài thi ngữ pháp có game = "grammar". */
export type QuestionGame = GameId | "grammar";

export type Word = {
  id: number;
  key: string;
  en: string;
  pos: string;
  vi: string;
  viAlt?: string[];
  ipa?: string | null;
  cefr: Cefr;
  domain: string;
};
export type Sentence = { id: number; en: string; vi?: string | null; cefr?: Cefr | null; kind?: string | null };
export type GrammarQ = {
  id: number;
  level: Cefr;
  topic?: string | null;
  question: string;
  options: string[];
  /** Số thứ tự đáp án đúng, bắt đầu từ 1. */
  answer: number;
  explanation?: string | null;
};

export type Scope = { by: "topic"; topicSlug: string } | { by: "level"; cefr: Cefr; domain: string | "all" };

/** level 0–5; bad = số lần sai liên tiếp khi đã thuộc. */
export type SrsState = { level: number; bad: number; nextReview: Date };

/** Thứ gửi xuống trình duyệt — KHÔNG chứa đáp án đúng (trừ `back` của flash/match). */
export type Question = {
  qid: string;
  game: QuestionGame;
  wordId?: number;
  grammarId?: number;
  sentenceId?: number;
  prompt: string;
  options?: string[];
  tokens?: string[];
  hint?: string;
  /** Mặt sau của thẻ (chỉ flash/match: trình duyệt cần cả hai mặt). */
  back?: string;
};

/** Lưu ở game_rounds.items / level_exams.items (chỉ server đọc). */
export type StoredItem = Question & {
  expected: string | string[];
  /** Đáp án thay thế chấp nhận được (ví dụ từ đồng nghĩa có cùng nghĩa trong vòng). */
  alts?: string[];
  part?: "vocab" | "grammar";
  /** Không chấp nhận "gần đúng" (bài thi). */
  strict?: boolean;
  explanation?: string;
  meta?: { en?: string; vi?: string };
};

export type Answer = { qid: string; value: string | string[]; hintUsed?: boolean; attempts?: number };

export type ReviewItem = {
  qid: string;
  game: QuestionGame;
  prompt: string;
  expected: string | string[];
  yourAnswer?: string | string[];
  explanation?: string;
  en?: string;
  vi?: string;
  wordId?: number;
};

export type LevelCounters = { cefr: Cefr; learned: number; total: number };
export type LevelStatus = {
  cefr: Cefr;
  pass: boolean;
  unlocked: boolean;
  /** Đủ điều kiện được vào thi (chưa tính giờ chờ / lượt trong ngày). */
  eligible: boolean;
  learnedCum: number;
  needLearned: number;
};
