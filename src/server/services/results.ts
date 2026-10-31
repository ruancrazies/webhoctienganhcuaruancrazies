import type { ReviewedItem } from "../../core/results";
import { compareNewestFirst, decodeCursor, encodeCursor, rebuildAttempt, tallyParts, weakestPart, wrongWordIdsOf } from "../../core/results";
import type { ResultDetail, ResultListItem, ResultRef, ResultsPage, ResultsQuery, ScheduleReviewResponse } from "../../types/api";
import { getConfig } from "../config";
import { ServiceError } from "../errors";
import { getFinishedExam, getFinishedPractice, listFinishedExams, listFinishedPractices, scheduleReviewNow, type FinishedDetail, type FinishedRow } from "../repo";
import { nowOf, type Ctx } from "./ctx";
import { currentStudyLevel } from "./levels";
import { revealedPassagesFor } from "./passages";

const notFound = () => new ServiceError(404, "NOT_FOUND", "Không tìm thấy bài này");

const toListItem = (type: ResultListItem["type"], r: FinishedRow): ResultListItem => ({
  type,
  id: r.id,
  cefr: r.cefr,
  finishedAt: new Date(r.finishedAtRaw).toISOString(),
  passed: r.passed,
  scores: r.scores,
  hasDetail: r.hasAnswers,
});

/**
 * Danh sách bài đã nộp của CHÍNH người này (thi lên cấp + kiểm tra thường xuyên), mới nhất trước, phân trang keyset.
 * Mỗi bảng lấy tối đa limit+1 dòng sau con trỏ rồi trộn: đủ để biết còn trang sau mà không cần đếm.
 */
export async function listResults(userId: string, q: ResultsQuery): Promise<ResultsPage> {
  const before = q.cursor ? decodeCursor(q.cursor) : undefined;
  if (q.cursor && !before) throw new ServiceError(400, "BAD_REQUEST", "Con trỏ phân trang không hợp lệ");

  const wantExam = q.type !== "practice";
  // Bài kiểm tra thường xuyên không có cấp: đang lọc theo cấp thì bỏ qua.
  const wantPractice = q.type !== "exam" && !q.cefr;
  const opts = { limit: q.limit + 1, before: before ?? undefined };

  const [exams, practices] = await Promise.all([
    wantExam ? listFinishedExams(userId, { ...opts, cefr: q.cefr }) : Promise.resolve([]),
    wantPractice ? listFinishedPractices(userId, opts) : Promise.resolve([]),
  ]);

  const merged = [
    ...exams.map((r) => ({ r, item: toListItem("exam", r) })),
    ...practices.map((r) => ({ r, item: toListItem("practice", r) })),
  ].sort((a, b) => compareNewestFirst({ finishedAt: a.r.finishedAtRaw, id: a.r.id }, { finishedAt: b.r.finishedAtRaw, id: b.r.id }));

  const page = merged.slice(0, q.limit);
  const last = page[page.length - 1];
  return {
    items: page.map((m) => m.item),
    nextCursor: merged.length > q.limit && last ? encodeCursor({ finishedAt: last.r.finishedAtRaw, id: last.r.id }) : undefined,
  };
}

/** Bài đã nộp của đúng người này; bài của người khác, bài chưa nộp hay không tồn tại đều là 404 (không lộ bài có tồn tại hay không). */
async function loadFinished(userId: string, ref: ResultRef): Promise<FinishedDetail> {
  const row = ref.type === "exam" ? await getFinishedExam(userId, ref.id) : await getFinishedPractice(userId, ref.id);
  if (!row) throw notFound();
  return row;
}

/** Bài làm trước khi có tính năng, hoặc bị đóng vì hết giờ: không có đáp án đã chọn để dựng lại. */
const noDetail = () => new ServiceError(409, "NO_DETAIL", "Bài này làm trước khi có tính năng xem lại nên không còn chi tiết bài làm");

/** Một câu của bài đã nộp của chính người này (dùng cho giải thích lỗi). Cùng quy tắc quyền như getResultDetail: bài người khác = 404. */
export async function getReviewedItem(userId: string, ref: ResultRef, qid: string): Promise<ReviewedItem> {
  const row = await loadFinished(userId, ref);
  if (!row.answers) throw noDetail();
  const item = rebuildAttempt(row.items, row.answers).find((i) => i.qid === qid);
  if (!item) throw new ServiceError(404, "NOT_FOUND", "Không tìm thấy câu này trong bài");
  return item;
}

/** Dựng lại bài đã nộp: đề, đáp án đã chọn, đáp án đúng, giải thích (kết quả chấm lấy từ lúc nộp, không chấm lại). */
export async function getResultDetail(userId: string, ref: ResultRef): Promise<ResultDetail> {
  const row = await loadFinished(userId, ref);
  if (!row.answers) throw noDetail();

  const items = rebuildAttempt(row.items, row.answers);
  const parts = tallyParts(items);
  const exam = getConfig().exam;
  const [passages, studyCefr] = await Promise.all([revealedPassagesFor(row.items), row.cefr ? Promise.resolve(row.cefr) : currentStudyLevel(userId)]);

  return {
    type: ref.type,
    id: row.id,
    cefr: row.cefr,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt.toISOString(),
    passed: row.passed,
    scores: row.scores,
    passMarks: ref.type === "exam" ? { total: exam.passTotal, part: exam.passPart } : null,
    parts,
    items,
    passages,
    weakPart: weakestPart(parts),
    studyCefr,
    wrongWords: wrongWordIdsOf(items).length,
  };
}

/**
 * "Ôn lại các từ sai": hạ next_review của các từ làm sai về hiện tại (giống apply_practice_result).
 * Chạy lại được nhiều lần; chỉ đụng từ ĐÃ HỌC và chưa đến hạn. Không đổi level nên bộ đếm "đã học" không lệch.
 */
export async function scheduleWrongWords(userId: string, ref: ResultRef, ctx: Ctx = {}): Promise<ScheduleReviewResponse> {
  const row = await loadFinished(userId, ref);
  if (!row.answers) throw noDetail();
  const ids = wrongWordIdsOf(rebuildAttempt(row.items, row.answers));
  return { wrongWords: ids.length, scheduled: await scheduleReviewNow(userId, ids, nowOf(ctx)) };
}
