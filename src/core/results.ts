import { eventPart, type EventPart, type StoredAnswer } from "./events";
import type { QuestionGame, StoredItem } from "./types";

/**
 * Xem lại bài đã nộp (giai đoạn 1b): dựng lại từng câu từ `items` (đề + đáp án đúng) và `answers` (đáp án đã chọn,
 * kết quả chấm đã ĐÓNG BĂNG lúc nộp). Hàm thuần, không phụ thuộc DB/HTTP.
 *
 * KHÔNG chấm lại: dùng `correct` / `near` đã lưu, để sửa luật chấm gần đúng (isNear) sau này không làm trang xem lại
 * lệch với điểm đã ghi (thiết kế mục 4.3).
 */

/** Một câu của bài đã nộp, đủ để hiện "đề / đáp án của bạn / đáp án đúng / giải thích". */
export type ReviewedItem = {
  qid: string;
  /** Số thứ tự trong đề, từ 1. */
  index: number;
  part: EventPart;
  game: QuestionGame;
  prompt: string;
  options?: string[];
  /** Đáp án đúng (chuỗi, hoặc mảng token với câu xếp câu). */
  expected: string | string[];
  /** Đáp án đã chọn. Bỏ trống = chuỗi rỗng. */
  yourAnswer: string | string[];
  /** Có trả lời (khác rỗng) hay không. Câu bỏ trống tính là sai. */
  answered: boolean;
  correct: boolean;
  /** Đúng "gần đúng" (sai một ký tự ở câu gõ). */
  near: boolean;
  explanation?: string;
  en?: string;
  vi?: string;
  wordId?: number;
  passageId?: number;
};

export const isBlankAnswer = (v: string | string[] | undefined): boolean =>
  v === undefined || (Array.isArray(v) ? v.every((x) => x.trim() === "") : v.trim() === "");

/**
 * Ghép đề với bài làm theo `qid`. Câu không có trong `answers` (không xảy ra với bài nộp bình thường) coi là bỏ trống, sai.
 * Câu trùng qid: lấy câu đầu (cùng quy tắc với gradeAll).
 */
export function rebuildAttempt(items: readonly StoredItem[], answers: readonly StoredAnswer[]): ReviewedItem[] {
  const byQid = new Map<string, StoredAnswer>();
  for (const a of answers) if (!byQid.has(a.qid)) byQid.set(a.qid, a);

  return items.map((item, i) => {
    const a = byQid.get(item.qid);
    const yourAnswer = a?.value ?? "";
    const r: ReviewedItem = {
      qid: item.qid,
      index: i + 1,
      part: eventPart(item),
      game: item.game,
      prompt: item.prompt,
      expected: item.expected,
      yourAnswer,
      answered: !isBlankAnswer(yourAnswer),
      correct: a?.correct ?? false,
      near: a?.near ?? false,
    };
    if (item.options?.length) r.options = item.options;
    if (item.explanation) r.explanation = item.explanation;
    if (item.meta?.en) r.en = item.meta.en;
    if (item.meta?.vi) r.vi = item.meta.vi;
    if (item.wordId !== undefined) r.wordId = item.wordId;
    if (item.passageId !== undefined) r.passageId = item.passageId;
    return r;
  });
}

export type PartTally = { part: EventPart; total: number; correct: number };

export const PART_ORDER: readonly EventPart[] = ["vocab", "grammar", "reading", "listening"];

/** Số câu và số câu đúng theo từng phần có trong đề (theo thứ tự cố định, bỏ phần không có câu). */
export function tallyParts(items: readonly Pick<ReviewedItem, "part" | "correct">[]): PartTally[] {
  const m = new Map<EventPart, PartTally>();
  for (const it of items) {
    const t = m.get(it.part) ?? { part: it.part, total: 0, correct: 0 };
    t.total += 1;
    if (it.correct) t.correct += 1;
    m.set(it.part, t);
  }
  return PART_ORDER.flatMap((p) => m.get(p) ?? []);
}

/**
 * Phần yếu nhất của bài: tỉ lệ đúng thấp nhất; hòa thì theo thứ tự vocab, grammar, reading, listening.
 * null nếu làm đúng hết (không có phần nào "yếu").
 */
export function weakestPart(tallies: readonly PartTally[]): EventPart | null {
  let best: PartTally | null = null;
  for (const t of tallies) {
    if (t.total === 0 || t.correct === t.total) continue;
    if (!best || t.correct / t.total < best.correct / best.total) best = t;
  }
  return best?.part ?? null;
}

/**
 * Id các từ làm SAI (mỗi từ một lần), để hẹn ôn lại. Cùng quy tắc với wrongWordIds của bài kiểm tra:
 * bỏ qua câu ngữ pháp / bài đọc / bài nghe (không có từ để ôn).
 */
export function wrongWordIdsOf(items: readonly Pick<ReviewedItem, "part" | "correct" | "wordId">[]): number[] {
  const out = new Set<number>();
  for (const it of items) {
    if (it.correct || it.part !== "vocab") continue;
    if (typeof it.wordId === "number") out.add(it.wordId);
  }
  return [...out];
}

export type ReviewFilter = "all" | "wrong" | EventPart;

/** Bộ lọc của trang xem lại: tất cả / chỉ câu sai / theo phần. */
export function filterReviewed<T extends Pick<ReviewedItem, "part" | "correct">>(items: readonly T[], f: ReviewFilter): T[] {
  if (f === "all") return [...items];
  if (f === "wrong") return items.filter((i) => !i.correct);
  return items.filter((i) => i.part === f);
}

// ---------- con trỏ phân trang danh sách bài đã nộp ----------

/**
 * Con trỏ keyset `<finished_at>|<id>`, finished_at giữ nguyên chuỗi microsecond của Postgres
 * (JS Date chỉ có mili-giây nên so sánh lại bằng Date sẽ bỏ sót / lặp dòng).
 */
export type ResultCursor = { finishedAt: string; id: string };

const TS_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const encodeCursor = (c: ResultCursor): string => `${c.finishedAt}|${c.id}`;

/** null nếu không đúng dạng (client gửi bậy): service coi như lỗi đầu vào. */
export function decodeCursor(s: string): ResultCursor | null {
  const i = s.lastIndexOf("|");
  if (i < 0) return null;
  const finishedAt = s.slice(0, i);
  const id = s.slice(i + 1).toLowerCase();
  if (!TS_RE.test(finishedAt) || !UUID_RE.test(id) || Number.isNaN(Date.parse(finishedAt))) return null;
  return { finishedAt, id };
}

/** Microsecond kể từ epoch của một chuỗi timestamptz (Date chỉ có mili-giây, không đủ để phân định hai dòng cùng mili-giây). */
export function micros(ts: string): number {
  const m = /\.(\d{1,6})/.exec(ts);
  const frac = m ? Number(m[1].padEnd(6, "0")) : 0;
  const whole = Date.parse(ts.replace(/\.\d+/, ""));
  return whole * 1000 + frac;
}

/** Thứ tự mới nhất trước: finished_at giảm dần (chính xác tới microsecond), hòa thì id giảm dần. */
export function compareNewestFirst(a: ResultCursor, b: ResultCursor): number {
  const d = micros(b.finishedAt) - micros(a.finishedAt);
  if (d !== 0) return d;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}
