import {
  BLITZ_BASE_POINTS,
  BLITZ_COMBO_STEP,
  BLITZ_LIVES,
  BLITZ_MAX_MULTIPLIER,
  DAILY_XP_CAP,
  PERFECT_BONUS,
  PERFECT_MIN_ITEMS,
  ROUND_XP_CAP,
  type GameRule,
} from "./rules";
import { compact, isNear, nfc, norm } from "./text";
import type { Answer, ReviewItem, StoredItem } from "./types";

export type CheckResult = { correct: boolean; near?: boolean };
export type GradedItem = { item: StoredItem; answer?: Answer; correct: boolean; near?: boolean };

const asString = (v: Answer["value"] | undefined): string | null => (typeof v === "string" ? v : null);

/**
 * Chấm một câu trả lời so với đáp án đã lưu. Không có câu trả lời, hoặc dùng gợi ý → sai (mục 5.6).
 *  - quiz/blitz/listen/grammar/cloze dạng chọn: so khớp chính xác văn bản đáp án (không bỏ dấu tiếng Việt)
 *  - type / cloze dạng gõ: norm() (+ đáp án thay thế); chấp nhận "gần đúng" (sai 1 ký tự) trừ khi `item.strict`
 *  - scramble: bỏ khoảng trắng rồi norm()
 *  - build: ghép các token rồi norm()
 *  - tf: "true" / "false"
 *  - flash / match: không chấm; có nộp mới tính là hoàn thành
 */
export function checkAnswer(item: StoredItem, answer: Answer | undefined): CheckResult {
  if (!answer || answer.hintUsed) return { correct: false };
  const expected = item.expected;

  switch (item.game) {
    case "flash":
    case "match": {
      const v = asString(answer.value);
      return { correct: v !== null && v.trim() !== "" };
    }
    case "quiz":
    case "blitz":
    case "listen":
    case "grammar":
    case "passage": {
      const v = asString(answer.value);
      return { correct: v !== null && typeof expected === "string" && nfc(v) === nfc(expected) };
    }
    case "tf": {
      const v = asString(answer.value);
      return { correct: v !== null && v.trim().toLowerCase() === expected };
    }
    case "scramble": {
      const v = asString(answer.value);
      return { correct: v !== null && typeof expected === "string" && compact(v) === compact(expected) };
    }
    case "build": {
      if (!Array.isArray(answer.value) || !Array.isArray(expected)) return { correct: false };
      return { correct: norm(answer.value.join(" ")) === norm(expected.join(" ")) };
    }
    case "type":
    case "cloze": {
      const v = asString(answer.value);
      if (v === null || typeof expected !== "string") return { correct: false };
      if (item.options?.length) return { correct: nfc(v) === nfc(expected) }; // cloze dạng chọn
      const accepted = [expected, ...(item.alts ?? [])];
      if (accepted.some((a) => norm(a) === norm(v))) return { correct: true };
      if (!item.strict && accepted.some((a) => isNear(v, a))) return { correct: true, near: true };
      return { correct: false };
    }
  }
}

/** Chấm cả vòng/bài thi theo thứ tự câu hỏi đã lưu. Câu trả lời trùng qid: lấy câu đầu tiên; qid lạ bị bỏ. */
export function gradeAll(items: StoredItem[], answers: Answer[]): GradedItem[] {
  const byQid = new Map<string, Answer>();
  for (const a of answers) if (!byQid.has(a.qid)) byQid.set(a.qid, a);
  return items.map((item) => {
    const answer = byQid.get(item.qid);
    const r = checkAnswer(item, answer);
    return { item, answer, correct: r.correct, near: r.near };
  });
}

/**
 * Mỗi từ chỉ tính MỘT lần cho tiến độ: đúng khi MỌI lượt của từ đó trong vòng đều đúng (mục 4.1).
 * Chỉ xét câu có wordId.
 */
export function perWordResults(graded: GradedItem[]): Map<number, boolean> {
  const out = new Map<number, boolean>();
  for (const g of graded) {
    const id = g.item.wordId;
    if (id === undefined) continue;
    out.set(id, (out.get(id) ?? true) && g.correct);
  }
  return out;
}

/**
 * Điểm Blitz do SERVER tính từ chuỗi trả lời (mục 4.1). Duyệt theo thứ tự câu hỏi:
 *  - đúng: + 10 × hệ số, hệ số = min(1 + ⌊combo/5⌋, 4) theo combo TRƯỚC câu này, rồi combo + 1
 *  - sai: combo về 0, mất 1 mạng; hết 3 mạng thì bỏ các câu sau
 *  - câu chưa trả lời: dừng (chưa tới)
 */
export function blitzScore(graded: Pick<GradedItem, "answer" | "correct">[]): number {
  let score = 0;
  let combo = 0;
  let lives = BLITZ_LIVES;
  for (const g of graded) {
    if (!g.answer) break;
    if (g.correct) {
      const mult = Math.min(1 + Math.floor(combo / BLITZ_COMBO_STEP), BLITZ_MAX_MULTIPLIER);
      score += BLITZ_BASE_POINTS * mult;
      combo += 1;
    } else {
      combo = 0;
      lives -= 1;
      if (lives <= 0) break;
    }
  }
  return score;
}

/** XP đã nhận trong ngày VN hiện tại (profiles.xp_today chỉ có nghĩa nếu xp_day trùng hôm nay). */
export function dailyXpUsed(xpToday: number, xpDay: number | null, today: number): number {
  return xpDay === today ? xpToday : 0;
}

export type XpResult = { xp: number; perfect: boolean; capped: boolean };

/**
 * XP của một vòng (mục 4.1): đúng × XP/câu; đúng hết (từ 5 câu) thưởng thêm 20%;
 * tối đa 500/vòng và 1.500/ngày (giờ VN).
 */
export function computeRoundXp(p: { right: number; total: number; rule: Pick<GameRule, "xp">; dailyUsed: number }): XpResult {
  const perfect = p.total >= PERFECT_MIN_ITEMS && p.right === p.total;
  let xp = p.right * p.rule.xp;
  if (perfect) xp += Math.round(xp * PERFECT_BONUS);
  const limit = Math.min(ROUND_XP_CAP, DAILY_XP_CAP - p.dailyUsed);
  const final = Math.max(0, Math.min(xp, limit));
  return { xp: final, perfect, capped: final < xp };
}

/** Nộp quá nhanh so với tối thiểu (chống bot nộp tức thì). */
export function submittedTooFast(elapsedMs: number, rule: Pick<GameRule, "minSecondsPerAnswer">, answerCount: number): boolean {
  return elapsedMs < rule.minSecondsPerAnswer * answerCount * 1000;
}

/** Mục "cần ôn lại" ở màn kết quả cho các câu sai. */
export function toReviewItem(g: GradedItem): ReviewItem {
  const { item, answer } = g;
  return {
    qid: item.qid,
    game: item.game,
    prompt: item.prompt,
    expected: item.expected,
    yourAnswer: answer?.value,
    explanation: item.explanation,
    en: item.meta?.en,
    vi: item.meta?.vi,
    wordId: item.wordId,
    passageId: item.passageId,
  };
}

export const reviewList = (graded: GradedItem[]): ReviewItem[] => graded.filter((g) => !g.correct).map(toReviewItem);
