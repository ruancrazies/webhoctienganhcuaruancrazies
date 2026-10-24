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
    topics: TopicRec[];
    domains: DomainRec[];
  };
  /** Số dòng từ vựng đọc được (kể cả dòng lỗi). */
  wordRowCount: number;
};
