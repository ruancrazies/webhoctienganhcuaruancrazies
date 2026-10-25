import { buildQuestViews, type QuestDelta } from "../../core/quests";
import { dayNo, startOfNextVnDay } from "../../core/streak";
import type { ClaimQuestRequest, ClaimQuestResponse, QuestsResponse } from "../../types/api";
import { hasTag, ServiceError } from "../errors";
import { HOUR, QUEST_CLAIM_PER_HOUR } from "../limits";
import { hitRateLimit } from "../ratelimit";
import { bumpQuests, claimQuestRpc, questRows } from "../repo";
import { nowOf, type Ctx } from "./ctx";

/** Nhiệm vụ hôm nay (giờ VN) của người dùng. Chỉ đọc: chưa có dòng thì hiển thị tiến độ 0. */
export async function getDailyQuests(userId: string, ctx: Ctx = {}): Promise<QuestsResponse> {
  const now = nowOf(ctx);
  const day = dayNo(now);
  const { quests, bonus } = buildQuestViews(await questRows(userId, day));
  return { day, resetAt: startOfNextVnDay(now).toISOString(), quests, bonus };
}

/**
 * Ghi tiến độ sau khi một vòng / lần học đã được ghi nhận. KHÔNG ném lỗi: nhiệm vụ chỉ là phần thưởng thêm,
 * lỗi ở đây không được làm hỏng kết quả vòng chơi đã lưu (chấp nhận mất tiến độ nhiệm vụ trong trường hợp hiếm đó).
 */
export async function recordQuestProgress(userId: string, delta: QuestDelta, ctx: Ctx = {}): Promise<void> {
  if (delta.learn <= 0 && delta.review <= 0 && delta.play <= 0 && delta.test <= 0) return;
  try {
    await bumpQuests(userId, dayNo(nowOf(ctx)), delta);
  } catch (e) {
    console.error("[quests] ghi tiến độ thất bại", e);
  }
}

/** Nhận thưởng một nhiệm vụ của HÔM NAY (ngày cũ đã hết hạn, không nhận được). */
export async function claimQuest(req: ClaimQuestRequest, userId: string, ctx: Ctx = {}): Promise<ClaimQuestResponse> {
  if (!(await hitRateLimit(`quest-claim:${userId}`, HOUR, QUEST_CLAIM_PER_HOUR))) {
    throw new ServiceError(429, "RATE_LIMITED", "Bạn thao tác quá nhiều, hãy nghỉ một chút");
  }
  try {
    const r = await claimQuestRpc(userId, dayNo(nowOf(ctx)), req.quest);
    return { quest: req.quest, reward: r.reward, xp: r.xp };
  } catch (e) {
    if (hasTag(e, "quest_already_claimed")) throw new ServiceError(409, "QUEST_CLAIMED", "Bạn đã nhận thưởng nhiệm vụ này rồi");
    if (hasTag(e, "quest_not_ready")) throw new ServiceError(409, "QUEST_NOT_READY", "Nhiệm vụ chưa hoàn thành");
    if (hasTag(e, "quest_not_found")) throw new ServiceError(409, "QUEST_NOT_READY", "Nhiệm vụ chưa hoàn thành");
    throw e;
  }
}
