import { createAdminClient } from "../db";
import { RepoError } from "../errors";
import type { StoredAnswer } from "../../core/events";
import type { ResultCursor } from "../../core/results";
import type { Cefr, StoredItem } from "../../core/types";
import { unwrap, unwrapList } from "./shared";

const db = () => createAdminClient();

type Num = number | string | null;
const num = (v: Num): number | null => (v === null ? null : Number(v));

/** Điểm của một bài đã nộp. Thang 0..1. reading/listening null = đề không có phần đó. */
export type ScoreRow = { total: number; vocab: number; grammar: number; reading: number | null; listening: number | null };

/** Dòng của danh sách: KHÔNG kèm `items` (đề, nặng, chứa đáp án). `hasAnswers` thay cho việc trả cả cột answers. */
export type FinishedRow = {
  id: string;
  /** Chuỗi gốc của Postgres, giữ đủ microsecond để làm con trỏ keyset. */
  finishedAtRaw: string;
  cefr: Cefr | null;
  passed: boolean | null;
  scores: ScoreRow;
  hasAnswers: boolean;
};

/** Dòng chi tiết: có đề và đáp án đã chọn. */
export type FinishedDetail = {
  id: string;
  cefr: Cefr | null;
  passed: boolean | null;
  startedAt: Date;
  finishedAt: Date;
  scores: ScoreRow;
  items: StoredItem[];
  answers: StoredAnswer[] | null;
};

type RawScores = { score_total: Num; score_vocab: Num; score_grammar: Num; score_reading: Num; score_listening: Num };
const toScores = (r: RawScores): ScoreRow => ({
  total: Number(r.score_total),
  vocab: Number(r.score_vocab),
  grammar: Number(r.score_grammar),
  reading: num(r.score_reading),
  listening: num(r.score_listening),
});

const SCORE_COLS = "score_total,score_vocab,score_grammar,score_reading,score_listening";
const asAnswers = (v: unknown): StoredAnswer[] | null => (Array.isArray(v) && v.length > 0 ? (v as StoredAnswer[]) : null);

export type ListOpts = { limit: number; before?: ResultCursor; cefr?: Cefr };

/**
 * Bài thi lên cấp đã có điểm (kể cả bài hết giờ: điểm 0, không có answers), mới nhất trước.
 * Keyset: (finished_at, id) < con trỏ. `answers` được chọn nguyên cột để biết có xem lại được không (vài KB mỗi bài, tối đa 50 dòng).
 */
export async function listFinishedExams(userId: string, o: ListOpts): Promise<FinishedRow[]> {
  type Raw = RawScores & { id: string; cefr: Cefr; finished_at: string; passed: boolean | null; answers: unknown };
  let q = db()
    .from("level_exams")
    .select(`id,cefr,finished_at,passed,answers,${SCORE_COLS}`)
    .eq("user_id", userId)
    .not("finished_at", "is", null)
    .not("score_total", "is", null);
  if (o.cefr) q = q.eq("cefr", o.cefr);
  if (o.before) q = q.or(`finished_at.lt.${o.before.finishedAt},and(finished_at.eq.${o.before.finishedAt},id.lt.${o.before.id})`);
  const rows = unwrapList<Raw>("results.exams", await q.order("finished_at", { ascending: false }).order("id", { ascending: false }).limit(o.limit));
  return rows.map((r) => ({ id: r.id, finishedAtRaw: r.finished_at, cefr: r.cefr, passed: r.passed, scores: toScores(r), hasAnswers: asAnswers(r.answers) !== null }));
}

/** Bài kiểm tra thường xuyên đã có điểm (bài hết giờ không có điểm nên không xuất hiện), mới nhất trước. */
export async function listFinishedPractices(userId: string, o: Omit<ListOpts, "cefr">): Promise<FinishedRow[]> {
  type Raw = RawScores & { id: string; finished_at: string; answers: unknown };
  let q = db()
    .from("practice_tests")
    .select(`id,finished_at,answers,${SCORE_COLS}`)
    .eq("user_id", userId)
    .not("finished_at", "is", null)
    .not("score_total", "is", null);
  if (o.before) q = q.or(`finished_at.lt.${o.before.finishedAt},and(finished_at.eq.${o.before.finishedAt},id.lt.${o.before.id})`);
  const rows = unwrapList<Raw>("results.practices", await q.order("finished_at", { ascending: false }).order("id", { ascending: false }).limit(o.limit));
  return rows.map((r) => ({ id: r.id, finishedAtRaw: r.finished_at, cefr: null, passed: null, scores: toScores(r), hasAnswers: asAnswers(r.answers) !== null }));
}

/** Một bài thi ĐÃ NỘP của đúng người này (bài của người khác hoặc bài chưa kết thúc: null). */
export async function getFinishedExam(userId: string, id: string): Promise<FinishedDetail | null> {
  type Raw = RawScores & { id: string; cefr: Cefr; items: StoredItem[]; answers: unknown; passed: boolean | null; started_at: string; finished_at: string };
  const r = unwrap<Raw>(
    "results.exam",
    await db().from("level_exams").select(`id,cefr,items,answers,passed,started_at,finished_at,${SCORE_COLS}`).eq("id", id).eq("user_id", userId).not("finished_at", "is", null).not("score_total", "is", null).maybeSingle(),
  );
  return r ? { id: r.id, cefr: r.cefr, passed: r.passed, startedAt: new Date(r.started_at), finishedAt: new Date(r.finished_at), scores: toScores(r), items: r.items, answers: asAnswers(r.answers) } : null;
}

export async function getFinishedPractice(userId: string, id: string): Promise<FinishedDetail | null> {
  type Raw = RawScores & { id: string; items: StoredItem[]; answers: unknown; started_at: string; finished_at: string };
  const r = unwrap<Raw>(
    "results.practice",
    await db().from("practice_tests").select(`id,items,answers,started_at,finished_at,${SCORE_COLS}`).eq("id", id).eq("user_id", userId).not("finished_at", "is", null).not("score_total", "is", null).maybeSingle(),
  );
  return r ? { id: r.id, cefr: null, passed: null, startedAt: new Date(r.started_at), finishedAt: new Date(r.finished_at), scores: toScores(r), items: r.items, answers: asAnswers(r.answers) } : null;
}

/**
 * Hẹn ôn lại ngay các từ: đưa next_review về `now` cho từ đã có tiến độ mà chưa đến hạn.
 * Giống apply_practice_result: KHÔNG đổi level / bộ đếm "đã học". Từ chưa học (không có dòng tiến độ) hoặc đã đến hạn sẵn
 * thì không bị đụng. Trả số từ thực sự được đổi. Một câu UPDATE nên không cần giao dịch; chạy lại nhiều lần không đổi kết quả.
 */
export async function scheduleReviewNow(userId: string, wordIds: number[], now: Date): Promise<number> {
  if (wordIds.length === 0) return 0;
  const iso = now.toISOString();
  const { data, error } = await db()
    .from("user_word_progress")
    .update({ next_review: iso, updated_at: iso })
    .eq("user_id", userId)
    .in("word_id", wordIds)
    .gt("next_review", iso)
    .select("word_id");
  if (error) throw new RepoError("results.scheduleReview", error.message, error.code);
  return (data ?? []).length;
}
