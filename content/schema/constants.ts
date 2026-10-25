/**
 * Hợp đồng giữa Google Sheet và script `content:*` (mục 2a, 3.4 của tài liệu kiến trúc).
 * Tên cột ở đây là hợp đồng: đổi tên cột trên Sheet thì phải đổi ở đây.
 */

export const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Cefr = (typeof CEFR)[number];

/** Loại từ cho phép (chỉnh tại đây nếu Sheet dùng ký hiệu khác). */
export const POS = [
  "n", "v", "adj", "adv", "prep", "conj", "pron", "det",
  "interj", "num", "modal", "aux", "phr",
] as const;
export type Pos = (typeof POS)[number];

/** Kiểu câu của tab `sentences` (cột `kind`). Giá trị ngoài danh sách chỉ bị cảnh báo. */
export const SENTENCE_KINDS = [
  "statement", "negative", "question", "conditional", "passive", "imperative", "exclamation",
] as const;

export const TAB_COLUMNS = {
  word: {
    required: ["key", "en", "vi", "pos", "cefr", "domain", "topics"],
    optional: ["vi_alt", "ipa", "rank", "note"],
  },
  sentences: {
    required: ["key", "en", "words"],
    optional: ["vi", "kind", "cefr", "source", "note"],
  },
  grammar: {
    required: ["key", "level", "question", "options", "answer"],
    optional: ["topic", "explanation", "note"],
  },
  topics: {
    required: ["slug", "title", "cefr", "domain"],
    optional: ["emoji", "sort"],
  },
  domains: {
    required: ["code", "title"],
    optional: ["emoji"],
  },
  /** Bài đọc / bài nghe: một đoạn văn kèm nhiều câu hỏi (tab `passage_questions`). */
  passages: {
    required: ["key", "skill", "level", "title", "text"],
    optional: ["topic", "audio", "source", "note"],
  },
  passageQuestions: {
    required: ["key", "passage", "kind", "question", "options", "answer"],
    optional: ["explanation", "note"],
  },
} as const;
export type TabKind = keyof typeof TAB_COLUMNS;

/** Kỹ năng của một đoạn văn (cột `skill` tab `passages`). */
export const PASSAGE_SKILLS = ["reading", "listening"] as const;
export type PassageSkill = (typeof PASSAGE_SKILLS)[number];

/** Dạng câu hỏi của đoạn văn (cột `kind` tab `passage_questions`): mcq = chọn đáp án, tf = đúng/sai. */
export const PASSAGE_KINDS = ["mcq", "tf"] as const;
export type PassageKind = (typeof PASSAGE_KINDS)[number];

/** Số lựa chọn của câu mcq. */
export const MCQ_MIN_OPTIONS = 2;
export const MCQ_MAX_OPTIONS = 6;

/**
 * Câu tf lưu `answer` dạng số cho thống nhất với câu mcq: 1 = đúng (true), 2 = sai (false).
 * Trên Sheet được gõ true/false (hoặc đúng/sai).
 */
export const TF_TRUE = 1;
export const TF_FALSE = 2;
export const TF_WORDS: Record<string, number> = { true: TF_TRUE, đúng: TF_TRUE, false: TF_FALSE, sai: TF_FALSE };

/** `en:pos:n` — chữ thường, không khoảng trắng, `en` không chứa dấu `:`. */
export const KEY_RE = /^[^\s:]+:[a-z]+:[1-9][0-9]*$/;

/** Từ chưa có `rank` được xếp sau cùng (mục 3.4). */
export const FREQ_RANK_DEFAULT = 1_000_000_000;
