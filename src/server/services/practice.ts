import { buildExamItems, examDeadline, scoreExam } from "../../core/exam";
import { toAnswerEvents, toStoredAnswers } from "../../core/events";
import { gradeAll, reviewList } from "../../core/grading";
import { answeredEnough, sample, wrongWordIds } from "../../core/practice";
import { toClientItems, type Pools } from "../../core/questions";
import { PRACTICE_MIN_WORDS, PRACTICE_START_PER_HOUR } from "../../core/rules";
import { dayNo } from "../../core/streak";
import type { Sentence } from "../../core/types";
import type { PracticeOverview, PracticeResult, PracticeStartResponse, PracticeSubmitRequest } from "../../types/api";
import { getConfig } from "../config";
import { RepoError, ServiceError, hasTag } from "../errors";
import { HOUR } from "../limits";
import { hitRateLimit } from "../ratelimit";
import {
  activePractice,
  applyPracticeResult,
  createPractice,
  distractorPools,
  failPractice,
  getPractice,
  learnedWordIds,
  pickGrammar,
  recentPracticeResults,
  sentencesFor,
  userLevelStats,
  wordsByIds,
  type PracticeRow,
} from "../repo";
import { nowOf, rngOf, type Ctx } from "./ctx";
import { currentStudyLevel } from "./levels";
import { clientPassagesFor, pickPassageBundles, revealedPassagesFor } from "./passages";
import { recordQuestProgress } from "./quests";
import { logActivity } from "./activity";
import { refreshInsightsSafe } from "./insights";

const OVERFETCH = 2.5; // lấy dư từ vì cloze cần câu ví dụ, không phải từ nào cũng dựng được
const SENTENCES_PER_WORD = 6;
const RECENT = 5;

const toStartResponse = async (t: PracticeRow, resumed: boolean): Promise<PracticeStartResponse> => ({
  testId: t.id,
  items: toClientItems(t.items),
  passages: await clientPassagesFor(t.items),
  expiresAt: t.expiresAt.toISOString(),
  resumed,
});

/** Cấp để lấy câu ngữ pháp: cấp đang học (mở, chưa qua); đã qua hết thì C1. */
const grammarLevel = currentStudyLevel;

/** Dữ liệu trang kiểm tra: số từ đã học, có làm được không, vài điểm gần nhất. */
export async function getPracticeOverview(userId: string, ctx: Ctx = {}): Promise<PracticeOverview> {
  const now = nowOf(ctx);
  const cfg = getConfig().exam;
  const [stats, recent, open] = await Promise.all([userLevelStats(userId), recentPracticeResults(userId, RECENT), activePractice(userId)]);
  const learnedWords = stats.reduce((a, s) => a + s.learned, 0);
  const hasOpen = !!open && open.expiresAt.getTime() > now.getTime();
  return {
    learnedWords,
    minWords: PRACTICE_MIN_WORDS,
    canStart: hasOpen || learnedWords >= PRACTICE_MIN_WORDS,
    hasOpen,
    vocabTotal: cfg.vocab.total,
    grammarTotal: cfg.grammar.total,
    readingPassages: cfg.passages?.reading ?? 0,
    listeningPassages: cfg.passages?.listening ?? 0,
    durationMinutes: cfg.durationMinutes,
    recent,
  };
}

/**
 * Bắt đầu (hoặc mở lại) bài kiểm tra. Làm lúc nào cũng được, không giờ chờ, không giới hạn lượt/ngày
 * (chỉ có giới hạn tần suất gọi API để chống lạm dụng). Đề lấy từ các từ ĐÃ HỌC.
 */
export async function startPractice(userId: string, ctx: Ctx = {}): Promise<PracticeStartResponse> {
  const now = nowOf(ctx);
  const rng = rngOf(ctx);
  const cfg = getConfig();

  if (!(await hitRateLimit(`practice-start:${userId}`, HOUR, PRACTICE_START_PER_HOUR))) {
    throw new ServiceError(429, "RATE_LIMITED", "Bạn gọi quá nhiều lần, hãy thử lại sau");
  }

  let open = await activePractice(userId);
  if (open && open.expiresAt.getTime() <= now.getTime()) {
    await failPractice(userId, open.id); // bỏ dở quá giờ: tính là một lần làm, điểm 0
    open = null;
  }
  if (open) return await toStartResponse(open, true);

  const learned = await learnedWordIds(userId);
  if (learned.length < PRACTICE_MIN_WORDS) {
    throw new ServiceError(409, "NOT_ENOUGH_WORDS", `Cần học ít nhất ${PRACTICE_MIN_WORDS} từ mới làm được bài kiểm tra`, {
      learned: learned.length,
      need: PRACTICE_MIN_WORDS,
    });
  }

  const words = await wordsByIds(sample(learned, Math.ceil(cfg.exam.vocab.total * OVERFETCH), rng));
  if (words.length === 0) throw new ServiceError(409, "NO_CONTENT", "Chưa đủ nội dung để ra đề");

  const level = await grammarLevel(userId); // cùng cấp cho ngữ pháp và bài đọc / nghe
  const [grammarQuestions, d, sentences, passages] = await Promise.all([
    pickGrammar(level, cfg.exam.grammar.total, rng),
    distractorPools(words, rng),
    sentencesFor(words.map((w) => w.id), SENTENCES_PER_WORD),
    pickPassageBundles(level, cfg.exam, rng),
  ]);
  const pools: Pools & { grammarQuestions: typeof grammarQuestions; passages: typeof passages } = {
    viDistractors: d.vi,
    enDistractors: d.en,
    sentences: sentences as Record<number, Sentence[]>,
    grammarQuestions,
    passages,
  };
  const items = buildExamItems(words, pools, cfg.exam, rng);
  if (items.length === 0) throw new ServiceError(409, "NO_CONTENT", "Chưa đủ nội dung để ra đề");

  try {
    const started = await toStartResponse(await createPractice(userId, items, examDeadline(now, cfg.exam)), false);
    await logActivity(userId, "test/start", {});
    return started;
  } catch (e) {
    if (e instanceof RepoError && e.code === "23505") {
      const winner = await activePractice(userId);
      if (winner && winner.expiresAt.getTime() > now.getTime()) return await toStartResponse(winner, true);
      throw new ServiceError(409, "TEST_IN_PROGRESS", "Đang có bài kiểm tra chưa nộp");
    }
    throw e;
  }
}

/**
 * Nộp bài: chấm, ghi điểm, hẹn ôn lại ngay các từ làm sai, tính nhiệm vụ ngày. Nộp sau giờ vẫn được chấm bình thường.
 * Không có đạt/không đạt và không cộng XP (thưởng nằm ở nhiệm vụ ngày).
 */
export async function submitPractice(req: PracticeSubmitRequest, userId: string, ctx: Ctx = {}): Promise<PracticeResult> {
  const now = nowOf(ctx);
  const cfg = getConfig();

  const test = await getPractice(req.testId, userId);
  if (!test || test.finishedAt) throw new ServiceError(409, "TEST_INVALID", "Bài kiểm tra đã kết thúc hoặc không hợp lệ");
  // Nộp trễ vẫn chấm như thường (không từ chối). Bài bỏ dở không nộp thì được đóng với điểm 0 khi người dùng bắt đầu bài mới.

  const graded = gradeAll(test.items, req.answers.slice(0, test.items.length)); // câu bỏ trống = sai
  const score = scoreExam(graded, cfg.exam);
  const wrongWords = wrongWordIds(graded);
  const counted = answeredEnough(graded);
  const previous = (await recentPracticeResults(userId, 1))[0];

  try {
    await applyPracticeResult(userId, test.id, { total: score.total, vocab: score.vocab, grammar: score.grammar, reading: score.reading, listening: score.listening, today: dayNo(now), wrongWords, answers: toStoredAnswers(graded), events: toAnswerEvents(graded) });
  } catch (e) {
    if (hasTag(e, "test_finished_or_invalid")) throw new ServiceError(409, "TEST_INVALID", "Bài kiểm tra đã kết thúc hoặc không hợp lệ");
    throw e;
  }
  await recordQuestProgress(userId, { learn: 0, review: 0, play: 0, test: counted ? 1 : 0 }, ctx);
  await logActivity(userId, "test/submit", {});
  await refreshInsightsSafe(userId, ctx);

  return {
    scoreTotal: score.total,
    scoreVocab: score.vocab,
    scoreGrammar: score.grammar,
    scoreReading: score.reading ?? null,
    scoreListening: score.listening ?? null,
    vocabCount: graded.filter((g) => g.item.part === "vocab").length,
    grammarCount: graded.filter((g) => g.item.part === "grammar").length,
    readingCount: graded.filter((g) => g.item.part === "reading").length,
    listeningCount: graded.filter((g) => g.item.part === "listening").length,
    review: reviewList(graded),
    passages: await revealedPassagesFor(test.items),
    scheduledReview: wrongWords.length,
    questCounted: counted,
    previousTotal: previous ? previous.total : null,
    resultId: test.id,
  };
}
