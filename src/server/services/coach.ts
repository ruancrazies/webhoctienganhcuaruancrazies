import { actionsFingerprint, buildCoachRequest, checkCoachText, fallbackCoach } from "../../core/snapshot";
import { dayNo } from "../../core/streak";
import type { CoachResponse } from "../../types/api";
import { askGemini } from "../chat/gemini";
import { optionalEnv } from "../env";
import { COACH_PER_DAY, DAY } from "../limits";
import { hitRateLimit } from "../ratelimit";
import { getCoachRow, saveCoachRow } from "../repo";
import { nowOf, type Ctx } from "./ctx";
import { getLearnerSnapshot } from "./learner";

const GENERIC = "Chào bạn! Hôm nay cứ chơi một vòng ngắn để giữ nhịp học nhé.";
const log = (what: string, e: unknown) => console.error(`[coach] ${what}`, e instanceof Error ? e.message : e);

/**
 * Lời nhắn coach hôm nay (mục 8, điểm tích hợp 2). Kế hoạch (3 hành động) vẫn do luật chọn ở trang chủ; Gemini chỉ viết lời nhắn ngắn.
 *
 * Thứ tự: snapshot → (tắt cá nhân hoá / chưa có khoá Gemini → câu theo luật) → cache theo ngày (còn khớp bộ gợi ý) →
 * giới hạn lượt gọi → Gemini → kiểm tra số liệu → lưu. Mọi lỗi và mọi câu bị loại đều rơi về câu theo luật, KHÔNG ném lỗi,
 * để trang chủ luôn có lời nhắn. Câu dự phòng không được cache, nên lần sau sẽ thử lại (trong hạn mức COACH_PER_DAY).
 *
 * Cố ý KHÔNG ghi activity_events: mở trang chủ không phải là học, và mỗi sự kiện sẽ kéo dài phiên học trong thống kê.
 */
export async function getCoach(userId: string, ai: boolean, ctx: Ctx = {}): Promise<CoachResponse> {
  const now = nowOf(ctx);
  const day = dayNo(now);
  const snap = await getLearnerSnapshot(userId, ctx);
  if (!snap) return { message: GENERIC, source: "rule", day };

  const rule: CoachResponse = { message: fallbackCoach(snap), source: "rule", day };
  if (!ai || !optionalEnv("GEMINI_API_KEY")) return rule;

  const fingerprint = actionsFingerprint(snap);
  try {
    const cached = await getCoachRow(userId, day);
    if (cached && cached.source === "ai" && cached.fingerprint === fingerprint) return { message: cached.message, source: "ai", day };
  } catch (e) {
    log("đọc cache", e); // không có cache thì viết mới, không phải lỗi của người học
  }

  try {
    if (!(await hitRateLimit(`coach:${userId}`, DAY, COACH_PER_DAY))) return rule;
    const { system, user } = buildCoachRequest(snap);
    const raw = await askGemini(system, [{ role: "user", text: user }], { temperature: 0.4, maxOutputTokens: 300 });
    const message = checkCoachText(raw, snap);
    if (!message) {
      console.warn("[coach] bỏ lời nhắn không đạt kiểm tra (độ dài, đường dẫn hoặc số lạ)"); // không ghi nội dung
      return rule;
    }
    try {
      await saveCoachRow(userId, day, { message, source: "ai", fingerprint });
    } catch (e) {
      log("lưu cache", e); // vẫn trả lời nhắn vừa viết
    }
    return { message, source: "ai", day };
  } catch (e) {
    log("gọi Gemini", e);
    return rule;
  }
}
