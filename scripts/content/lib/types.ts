/** Một dòng dữ liệu của một tab. `row` là số dòng trên Sheet (hàng 1 = tiêu đề). */
export type Row = { tab: string; row: number; v: Record<string, string> };

export type TabData = {
  name: string;
  headers: string[];
  /** Chỉ các dòng không trống hoàn toàn. */
  rows: Row[];
  /** Tổng số dòng đọc được (kể cả tiêu đề và dòng trống) — dùng để căn cột khi sinh key. */
  lastRow: number;
};

export type Issue = {
  level: "error" | "warn";
  tab: string;
  row?: number;
  code: string;
  msg: string;
};

type At = { tab: string; row: number };

export type WordRec = {
  key: string;
  en: string;
  vi: string;
  viAlt: string[];
  pos: string;
  ipa: string | null;
  cefr: string;
  domain: string;
  topics: string[];
  freqRank: number;
  at: At;
};

export type SentenceRec = {
  key: string;
  en: string;
  vi: string | null;
  kind: string | null;
  cefr: string | null;
  source: string | null;
  words: string[];
  at: At;
};

export type GrammarRec = {
  key: string;
  level: string;
  topic: string | null;
  question: string;
  options: string[];
  /** Số thứ tự đáp án đúng, bắt đầu từ 1. */
  answer: number;
  explanation: string | null;
  at: At;
};

export type PassageRec = {
  key: string;
  skill: string;
  level: string;
  title: string;
  /** Bài đọc: nội dung hiển thị. Bài nghe: lời thoại/văn bản để đọc to (chỉ lộ sau khi nộp). */
  body: string;
  topic: string | null;
  /** Tên file / URL audio; trống thì trình duyệt đọc `body` bằng giọng đọc (TTS). */
  audio: string | null;
  source: string | null;
  at: At;
};

export type PassageQuestionRec = {
  key: string;
  /** key của đoạn văn. */
  passage: string;
  kind: string;
  question: string;
  /** mcq: 2–6 lựa chọn. tf: rỗng. */
  options: string[];
  /** mcq: số thứ tự đáp án đúng (từ 1). tf: 1 = đúng, 2 = sai. */
  answer: number;
  explanation: string | null;
  /** Thứ tự trong đoạn văn, theo thứ tự dòng trên Sheet (bắt đầu từ 1). */
  sort: number;
  at: At;
};

export type TopicRec = {
  slug: string;
  title: string;
  cefr: string;
  domain: string;
  emoji: string | null;
  sort: number | null;
  at: At;
};

export type DomainRec = { code: string; title: string; emoji: string | null; at: At };

export type ValidationResult = {
  issues: Issue[];
  errorCount: number;
  warnCount: number;
  /** Chỉ gồm các dòng không có lỗi. */
  data: {
    words: WordRec[];
    sentences: SentenceRec[];
    grammar: GrammarRec[];
    passages: PassageRec[];
    passageQuestions: PassageQuestionRec[];
    topics: TopicRec[];
    domains: DomainRec[];
  };
  /** Số dòng từ vựng đọc được (kể cả dòng lỗi). */
  wordRowCount: number;
};
