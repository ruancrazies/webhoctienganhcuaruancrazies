import { buildExplainRequest, cleanExplanation, explainCacheMaterial, isCacheableAnswer, type ExplainTarget } from "../../core/explain";
import type { ExplainResponse, ResultRef } from "../../types/api";
import { askGemini } from "../chat/gemini";
import { ServiceError } from "../errors";
import { sha256Hex } from "../hash";
import { DAY, EXPLAIN_PER_DAY, EXPLAIN_PER_HOUR, HOUR } from "../limits";
import { hitRateLimit } from "../ratelimit";
import { getErrorExplanation, saveErrorExplanation } from "../repo";
import { getReviewedItem } from "./results";

const log = (what: string, e: unknown) => console.error(`[explain] ${what}`, e instanceof Error ? e.message : e);

/**
 * Giải thích vì sao một câu trong bài ĐÃ NỘP của chính người dùng bị sai (mục 8, điểm tích hợp 3).
 *
 *  - Quyền: câu lấy qua getReviewedItem (bài của người khác = 404), nên không thể xin giải thích cho câu mình không được xem.
 *  - Câu bài đọc/nghe (`passage`) chưa hỗ trợ: đề của chúng nằm ở đoạn văn, không có trong `prompt`.
 *  - Cache dùng chung theo (câu, đáp án sai): cùng lỗi trên cùng câu chỉ tốn một lần gọi LLM. Đáp án gõ quá dài thì không cache.
 *  - Gemini lỗi/bị loại/hết hạn mức: có giải thích sẵn trong đề thì trả nó, không thì báo lỗi để người học bấm lại sau.
 */
export async function explainMistake(userId: string, ref: ResultRef, qid: string): Promise<ExplainResponse> {
  const item = await getReviewedItem(userId, ref, qid);
  if (item.game === "passage") throw new ServiceError(422, "EXPLAIN_UNSUPPORTED", "Câu bài đọc/nghe chưa có giải thích tự động");
  if (item.correct) throw new ServiceError(400, "NOT_WRONG", "Câu này bạn đã làm đúng rồi");

  const target: ExplainTarget = {
    game: item.game,
    prompt: item.prompt,
    expected: item.expected,
    yourAnswer: item.yourAnswer,
    options: item.options,
    explanation: item.explanation,
    en: item.en,
    vi: item.vi,
  };
  const key = sha256Hex(explainCacheMaterial(target));
  const cacheable = isCacheableAnswer(target);

  if (cacheable) {
    try {
      const hit = await getErrorExplanation(key);
      if (hit) return { text: hit, source: "cache" };
    } catch (e) {
      log("đọc cache", e);
    }
  }

  const given: ExplainResponse | null = target.explanation ? { text: target.explanation, source: "rule" } : null;
  try {
    if (!(await hitRateLimit(`explain-hour:${userId}`, HOUR, EXPLAIN_PER_HOUR)) || !(await hitRateLimit(`explain-day:${userId}`, DAY, EXPLAIN_PER_DAY))) {
      throw new ServiceError(429, "RATE_LIMITED", "Bạn đã xin giải thích nhiều rồi, nghỉ một lát rồi bấm tiếp nhé");
    }
    const { system, user } = buildExplainRequest(target);
    const raw = await askGemini(system, [{ role: "user", text: user }], { temperature: 0.3, maxOutputTokens: 400 });
    const text = cleanExplanation(raw);
    if (!text) throw new ServiceError(502, "EXPLAIN_FAILED", "Mình chưa giải thích rõ được câu này, bạn thử lại sau nhé");
    if (cacheable) {
      try {
        await saveErrorExplanation(key, text);
      } catch (e) {
        log("lưu cache", e); // vẫn trả giải thích vừa viết
      }
    }
    return { text, source: "ai" };
  } catch (e) {
    if (given) return given;
    throw e;
  }
}
