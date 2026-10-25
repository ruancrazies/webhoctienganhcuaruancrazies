import { attemptsLeft, buildExamItems, checkExamStart, examDeadline, isSubmitTooLate, scoreExam, type ExamGate } from "../../core/exam";
import { gradeAll, reviewList } from "../../core/grading";
import { toClientItems, type Pools } from "../../core/questions";
import { EXAM_START_PER_HOUR } from "../../core/rules";
import { startOfVnDay, dayNo } from "../../core/streak";
import { statusOf } from "../../core/levels";
import type { Sentence } from "../../core/types";
import type { ExamResult, ExamStartRequest, ExamStartResponse, ExamSubmitRequest } from "../../types/api";
import { getConfig } from "../config";
import { hasTag, RepoError, ServiceError } from "../errors";
import { HOUR } from "../limits";
import { hitRateLimit } from "../ratelimit";
import {
  activeExam,
  applyExamResult,
  createExam,
  distractorPools,
  examStartTimes,
  failExam,
  getExam,
  lastExamWordIds,
  lastFailedExamEnd,
  pickGrammar,
  pickWordsForExam,
  sentencesFor,
  type ExamRow,
} from "../repo";
import { nowOf, rngOf, type Ctx } from "./ctx";
import { clientPassagesFor, pickPassageBundles, revealedPassagesFor } from "./passages";
import { getLevelStatuses } from "./levels";

const OVERFETCH = 2.5; // lấy dư từ vì cloze cần câu ví dụ, không phải từ nào cũng dựng được
const SENTENCES_PER_WORD = 6;

const toStartResponse = async (exam: ExamRow, resumed: boolean): Promise<ExamStartResponse> => ({
  examId: exam.id,
  items: toClientItems(exam.items),
  passages: await clientPassagesFor(exam.items),
  expiresAt: exam.expiresAt.toISOString(),
  resumed,
});

function gateError(g: Extract<ExamGate, { ok: false }>): ServiceError {
  const extra = { attemptsLeft: g.attemptsLeft, nextAt: g.nextAt?.toISOString(), missingWords: g.missingWords };
  switch (g.code) {
    case "NO_EXAM":
      return new ServiceError(400, g.code, "Cấp này không có bài kiểm tra", extra);
    case "LOCKED":
      return new ServiceError(403, g.code, "Cấp này chưa mở (không thi nhảy cấp)", extra);
    case "ALREADY_PASSED":
      return new ServiceError(409, g.code, "Bạn đã qua cấp này", extra);
    case "NOT_ELIGIBLE":
      return new ServiceError(403, g.code, `Cần học thêm ${g.missingWords ?? 0} từ mới được thi cấp này`, extra);
    case "OTHER_EXAM_OPEN":
      return new ServiceError(409, g.code, "Đang có bài thi cấp khác chưa nộp", extra);
    case "DAILY_LIMIT":
      return new ServiceError(429, g.code, "Bạn đã dùng hết lượt thi hôm nay", extra);
    case "COOLDOWN":
      return new ServiceError(429, g.code, "Chưa hết thời gian chờ để thi lại cấp này", extra);
  }
}

/** Mục 5.13: bắt đầu (hoặc tiếp tục) bài thi lên cấp. */
export async function startExam(req: ExamStartRequest, userId: string, ctx: Ctx = {}): Promise<ExamStartResponse> {
  const now = nowOf(ctx);
  const rng = rngOf(ctx);
  const cfg = getConfig();

  if (!(await hitRateLimit(`exam-start:${userId}`, HOUR, EXAM_START_PER_HOUR))) {
    throw new ServiceError(429, "RATE_LIMITED", "Bạn gọi quá nhiều lần, hãy thử lại sau");
  }

  const status = statusOf(await getLevelStatuses(userId), req.cefr);

  // Bài dở đã hết giờ: đóng (tính trượt) TRƯỚC khi đếm lượt/giờ chờ để nó nằm trong lịch sử.
  let open = await activeExam(userId);
  if (open && open.expiresAt.getTime() <= now.getTime()) {
    await failExam(userId, open.id);
    open = null;
  }

  const [attemptsToday, lastFailEndedAt] = await Promise.all([
    examStartTimes(userId, startOfVnDay(now)),
    lastFailedExamEnd(userId, req.cefr),
  ]);

  const gate = checkExamStart({
    status,
    open: open ? { cefr: open.cefr, expiresAt: open.expiresAt } : null,
    attemptsToday,
    lastFailEndedAt,
    now,
    cfg: cfg.exam,
  });
  if (!gate.ok) throw gateError(gate);
  if (gate.resume && open) return await toStartResponse(open, true); // không tốn lượt

  // Dựng đề: từ general của cả cấp (không chỉ từ đã học), trừ các từ của lượt thi trước
  const exclude = await lastExamWordIds(userId, req.cefr);
  const words = await pickWordsForExam(req.cefr, "general", Math.ceil(cfg.exam.vocab.total * OVERFETCH), exclude, rng);
  const [grammarQuestions, d, sentences, passages] = await Promise.all([
    pickGrammar(req.cefr, cfg.exam.grammar.total, rng),
    distractorPools(words, rng),
    sentencesFor(words.map((w) => w.id), SENTENCES_PER_WORD),
    pickPassageBundles(req.cefr, cfg.exam, rng),
  ]);
  const pools: Pools & { grammarQuestions: typeof grammarQuestions; passages: typeof passages } = {
    viDistractors: d.vi,
    enDistractors: d.en,
    sentences: sentences as Record<number, Sentence[]>,
    grammarQuestions,
    passages,
  };
  const items = buildExamItems(words, pools, cfg.exam, rng);
  if (items.length === 0) throw new ServiceError(409, "NO_CONTENT", "Chưa đủ nội dung để ra đề cho cấp này");

  try {
    return await toStartResponse(await createExam(userId, req.cefr, items, examDeadline(now, cfg.exam)), false);
  } catch (e) {
    // Hai request song song: unique partial index (một bài dở/người) chặn request thứ hai → trả lại bài của request thứ nhất.
    if (e instanceof RepoError && e.code === "23505") {
      const winner = await activeExam(userId);
      if (winner && winner.cefr === req.cefr && winner.expiresAt.getTime() > now.getTime()) return await toStartResponse(winner, true);
      throw new ServiceError(409, "EXAM_IN_PROGRESS", "Đang có bài thi chưa nộp");
    }
    throw e;
  }
}

/** Mục 5.13: nộp bài, server chấm, ghi kết quả. Không đụng XP/SRS/grammar_stats (ADR-8). */
export async function submitExam(req: ExamSubmitRequest, userId: string, ctx: Ctx = {}): Promise<ExamResult> {
  const now = nowOf(ctx);
  const cfg = getConfig();

  const exam = await getExam(req.examId, userId);
  if (!exam || exam.finishedAt) throw new ServiceError(409, "EXAM_INVALID", "Bài thi đã kết thúc hoặc không hợp lệ");

  if (isSubmitTooLate(now, exam.expiresAt)) {
    await failExam(userId, exam.id); // đã tính là một lượt trượt
    throw new ServiceError(410, "EXAM_EXPIRED", "Hết giờ làm bài");
  }

  const graded = gradeAll(exam.items, req.answers.slice(0, exam.items.length)); // câu bỏ trống = sai
  const score = scoreExam(graded, cfg.exam);

  try {
    await applyExamResult(userId, exam.id, { passed: score.passed, total: score.total, vocab: score.vocab, grammar: score.grammar, reading: score.reading, listening: score.listening, today: dayNo(now) });
  } catch (e) {
    // Thua cuộc đua nộp hai lần (hoặc bài vừa bị đóng vì hết giờ)
    if (hasTag(e, "exam_finished_or_invalid")) throw new ServiceError(409, "EXAM_INVALID", "Bài thi đã kết thúc hoặc không hợp lệ");
    throw e;
  }

  const left = attemptsLeft(await examStartTimes(userId, startOfVnDay(now)), now, cfg.exam);
  return {
    passed: score.passed,
    scoreTotal: score.total,
    scoreVocab: score.vocab,
    scoreGrammar: score.grammar,
    scoreReading: score.reading ?? null,
    scoreListening: score.listening ?? null,
    review: reviewList(graded),
    passages: await revealedPassagesFor(exam.items),
    nextAttemptAt: score.passed ? undefined : new Date(now.getTime() + cfg.exam.cooldownMinutes * 60_000).toISOString(),
    attemptsLeftToday: left,
  };
}
