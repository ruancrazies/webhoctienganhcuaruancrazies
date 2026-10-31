import { buildSystemPrompt, sanitizeHistory } from "../../core/chat";
import { buildLearnerContext } from "../../core/snapshot";
import type { ChatRequest, ChatResponse } from "../../types/api";
import { askGemini } from "../chat/gemini";
import { GRAMMAR_KNOWLEDGE } from "../chat/knowledge";
import { ServiceError } from "../errors";
import { CHAT_PER_DAY, CHAT_PER_HOUR, DAY, HOUR } from "../limits";
import { hitRateLimit } from "../ratelimit";
import { logActivity } from "./activity";
import { getLearnerSnapshot } from "./learner";

/**
 * Trò chuyện với thú cưng: giới hạn tần suất → dựng prompt (tính cách + kiến thức ngữ pháp + LEARNER_CONTEXT) → hỏi Gemini.
 * LEARNER_CONTEXT là bản tóm tắt ẩn danh về người học (core/snapshot); người học tắt được (`personalize: false`), và lỗi khi dựng nó
 * chỉ làm pet trả lời như trước (không ngữ cảnh), không làm hỏng cuộc trò chuyện.
 */
export async function chatWithPet(req: ChatRequest, userId: string): Promise<ChatResponse> {
  if (!(await hitRateLimit(`chat-hour:${userId}`, HOUR, CHAT_PER_HOUR)) || !(await hitRateLimit(`chat-day:${userId}`, DAY, CHAT_PER_DAY))) {
    throw new ServiceError(429, "RATE_LIMITED", "Hôm nay mình trò chuyện nhiều rồi, nghỉ một lát rồi nói tiếp nhé");
  }
  const history = sanitizeHistory(req.history);
  const messages = [...history, { role: "user" as const, text: req.message }].map((t) => ({
    role: t.role === "user" ? ("user" as const) : ("model" as const),
    text: t.text,
  }));
  const snapshot = req.personalize ? await getLearnerSnapshot(userId) : null;
  const reply = await askGemini(buildSystemPrompt(req.pet, GRAMMAR_KNOWLEDGE, snapshot ? buildLearnerContext(snapshot) : undefined), messages);
  await logActivity(userId, "chat", { pet: req.pet }); // chỉ đếm lượt: không ghi nội dung trò chuyện
  return { reply };
}
