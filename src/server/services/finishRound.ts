import {
  blitzScore,
  computeRoundXp,
  dailyXpUsed,
  gradeAll,
  perWordResults,
  reviewList,
  submittedTooFast,
  type GradedItem,
} from "../../core/grading";
import { BLITZ_LIVES, GAME_RULES, PLAY_FINISH_PER_HOUR } from "../../core/rules";
import { nextSrsState } from "../../core/srs";
import { dayNo } from "../../core/streak";
import type { FinishRequest, FinishResponse } from "../../types/api";
import { hasTag, ServiceError } from "../errors";
import { HOUR } from "../limits";
import { hitRateLimit } from "../ratelimit";
import { applyRoundResult, getProfile, getRound, progressFor, type RoundPayload } from "../repo";
import { nowOf, type Ctx } from "./ctx";

/**
 * Câu được tính của vòng Blitz: duyệt theo thứ tự, dừng ở câu chưa trả lời hoặc khi mất mạng thứ 3
 * (cùng luật với core/grading.blitzScore) — câu nộp thêm sau đó không được tính XP/SRS.
 */
function blitzEffective(graded: GradedItem[]): GradedItem[] {
  const out: GradedItem[] = [];
  let lives = BLITZ_LIVES;
  for (const g of graded) {
    if (!g.answer) break;
    out.push(g);
    if (!g.correct && --lives <= 0) break;
  }
  return out;
}

/** Mục 5.6: chấm → SRS → XP → ghi MỘT lần nguyên tử (apply_round_result). */
export async function finishRound(req: FinishRequest, userId: string, ctx: Ctx = {}): Promise<FinishResponse> {
  const now = nowOf(ctx);

  const row = await getRound(req.roundId, userId);
  if (!row || row.finishedAt) throw new ServiceError(409, "ROUND_INVALID", "Vòng đã kết thúc hoặc không hợp lệ");
  const { round } = row;
  const rule = GAME_RULES[row.game];
  if (!rule) throw new ServiceError(409, "ROUND_INVALID", "Vòng không hợp lệ");

  if (!(await hitRateLimit(`play-finish:${userId}`, HOUR, PLAY_FINISH_PER_HOUR))) {
    throw new ServiceError(429, "RATE_LIMITED", "Bạn nộp quá nhiều vòng, hãy nghỉ một chút");
  }

  // Chấm. Chỉ câu CÓ trả lời mới tính cho SRS/ôn lại: câu chưa tới (hết giờ/hết mạng Blitz, bỏ qua) không phải câu sai.
  const graded = gradeAll(round.items, req.answers.slice(0, rule.cap));
  const results = row.game === "blitz" ? blitzEffective(graded) : graded.filter((g) => g.answer);
  if (results.length === 0) throw new ServiceError(400, "NO_ANSWERS", "Chưa có câu trả lời hợp lệ nào");

  if (submittedTooFast(now.getTime() - row.createdAt.getTime(), rule, results.length)) {
    throw new ServiceError(429, "TOO_FAST", "Nộp quá nhanh");
  }

  // SRS (mỗi từ một lần; đúng khi MỌI lượt của từ đó đều đúng)
  const updates: RoundPayload["updates"] = [];
  if (rule.srs) {
    const perWord = perWordResults(results);
    const currents = await progressFor(userId, [...perWord.keys()]);
    for (const [wordId, ok] of perWord) {
      const s = nextSrsState(currents.get(wordId) ?? null, ok, now);
      updates.push({ word_id: wordId, level: s.level, bad: s.bad, next_review: s.nextReview.toISOString() });
    }
  }

  // XP: tổng để xét "đúng hết" là số câu của cả vòng (bỏ qua câu thì không được thưởng đúng hết)
  const today = dayNo(now);
  const profile = await getProfile(userId);
  if (!profile) throw new ServiceError(404, "NO_PROFILE", "Không tìm thấy hồ sơ người dùng");
  const right = results.filter((g) => g.correct).length;
  const { xp, perfect } = computeRoundXp({
    right,
    total: round.items.length,
    rule,
    dailyUsed: dailyXpUsed(profile.xpToday, profile.xpDay, today),
  });

  // Ngữ pháp: câu có grammarId (tf, build dự phòng). Cấp lấy từ vòng.
  const grammar = results.filter((g) => g.item.grammarId !== undefined).map((g) => ({ level: round.cefr, correct: g.correct }));

  // Blitz: điểm do server tính; bảng xếp hạng theo cấp của VÒNG (không nhận `level` từ client)
  const blitz = row.game === "blitz" ? { key: `blitz:${round.cefr}`, score: blitzScore(results) } : null;

  let out;
  try {
    out = await applyRoundResult(userId, row.id, { today, xp, updates, grammar, blitz });
  } catch (e) {
    // Thua cuộc đua nộp hai lần: UPDATE … WHERE finished_at IS NULL không khớp dòng nào
    if (hasTag(e, "round_finished_or_invalid")) throw new ServiceError(409, "ROUND_INVALID", "Vòng đã kết thúc hoặc không hợp lệ");
    throw e;
  }

  return {
    xpGained: xp,
    xp: out.xp,
    perfect,
    streak: out.streak,
    review: reviewList(results),
    newBest: blitz ? out.newBest : undefined,
    board: out.board ?? undefined,
  };
}
