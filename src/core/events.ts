import type { GradedItem } from "./grading";
import type { StoredItem } from "./types";

/**
 * Sự kiện phân tích: biến kết quả chấm thành các dòng ghi vào answer_events / cột `answers` (migration 0012).
 * Hàm thuần, không phụ thuộc DB/HTTP — test bằng vitest.
 *
 * Nhãn nội dung (cefr, domain, pos, chủ đề ngữ pháp) KHÔNG điền ở đây: SQL (record_answer_events) tự lấy từ bảng
 * nội dung theo word_id / grammar_id / passage_id, để chỉ có một nguồn nhãn.
 */

/** Giới hạn của response_ms (khớp CHECK ở DB). Quá mức này gần như chắc chắn là tab bị bỏ quên, không phải thời gian nghĩ. */
export const RESPONSE_MS_MAX = 120_000;
/** Độ dài tối đa của đáp án người dùng / đáp án đúng lưu trong sự kiện. */
export const EVENT_VALUE_MAX = 200;

export type EventPart = "vocab" | "grammar" | "reading" | "listening";

/** Một dòng của payload.events. Khóa snake_case để khớp cột (giống payload.updates của apply_round_result). */
export type AnswerEvent = {
  qid: string;
  game: string;
  part: EventPart;
  word_id?: number;
  grammar_id?: number;
  passage_id?: number;
  passage_question_id?: number;
  correct: boolean;
  near: boolean;
  hint_used: boolean;
  attempts?: number;
  answer_value: string;
  expected: string;
  response_ms?: number;
};

/** Một dòng của level_exams.answers / practice_tests.answers: đủ để dựng lại bài làm mà không phụ thuộc luật chấm sau này. */
export type StoredAnswer = { qid: string; value: string | string[]; correct: boolean; near: boolean };

/** Số nguyên trong [0, RESPONSE_MS_MAX]; undefined nếu không phải số hữu hạn (không có thông tin ≠ 0 ms). */
export function clampResponseMs(ms: unknown): number | undefined {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return undefined;
  return Math.min(RESPONSE_MS_MAX, Math.max(0, Math.round(ms)));
}

/** Đáp án (chuỗi hoặc mảng token) → một chuỗi gọn để lưu. */
export function eventText(v: string | string[] | undefined): string {
  if (v === undefined) return "";
  const s = Array.isArray(v) ? v.join(" ") : v;
  return s.slice(0, EVENT_VALUE_MAX);
}

/** Phần (part) của câu: bài thi đã gắn sẵn; câu của vòng chơi: ngữ pháp nếu có grammarId, còn lại là từ vựng. */
export function eventPart(item: StoredItem): EventPart {
  return item.part ?? (item.grammarId !== undefined ? "grammar" : "vocab");
}

/**
 * `correct` của sự kiện. Với trò server có chấm thì đúng bằng kết quả chấm.
 * Flash / match server KHÔNG chấm (mọi câu nộp đều "đúng" để tính hoàn thành) → nếu ghi nguyên thì 100% câu đúng, vô nghĩa
 * cho thống kê độ khó. Với hai trò này coi là đúng khi nhớ/ghép ngay lần đầu (attempts = số lần "chưa nhớ" / ghép nhầm = 0).
 */
export function eventCorrect(g: GradedItem): boolean {
  if (g.item.game === "flash" || g.item.game === "match") return g.correct && (g.answer?.attempts ?? 0) === 0;
  return g.correct;
}

export function toAnswerEvent(g: GradedItem): AnswerEvent {
  const { item, answer } = g;
  const e: AnswerEvent = {
    qid: item.qid,
    game: item.game,
    part: eventPart(item),
    correct: eventCorrect(g),
    near: !!g.near,
    hint_used: !!answer?.hintUsed,
    answer_value: eventText(answer?.value),
    expected: eventText(item.expected),
  };
  if (item.wordId !== undefined) e.word_id = item.wordId;
  if (item.grammarId !== undefined) e.grammar_id = item.grammarId;
  if (item.passageId !== undefined) e.passage_id = item.passageId;
  if (item.passageQuestionId !== undefined) e.passage_question_id = item.passageQuestionId;
  if (answer?.attempts !== undefined) e.attempts = answer.attempts;
  const ms = clampResponseMs(answer?.responseMs);
  if (ms !== undefined) e.response_ms = ms;
  return e;
}

/**
 * Sự kiện của các câu đã chấm.
 *  - Vòng chơi: truyền các câu ĐÃ TRẢ LỜI (cùng quy tắc với SRS: câu chưa tới / bỏ qua không phải câu sai).
 *  - Bài thi / kiểm tra: truyền TẤT CẢ câu — câu bỏ trống tính là sai, ghi với answer_value rỗng.
 */
export const toAnswerEvents = (graded: GradedItem[]): AnswerEvent[] => graded.map(toAnswerEvent);

/** Bài làm đã đóng băng kết quả chấm (kể cả `correct`), để đổi luật chấm gần đúng sau này không làm trang xem lại lệch điểm. Câu bỏ trống: value "". */
export const toStoredAnswers = (graded: GradedItem[]): StoredAnswer[] =>
  graded.map((g) => ({ qid: g.item.qid, value: g.answer?.value ?? "", correct: g.correct, near: !!g.near }));
