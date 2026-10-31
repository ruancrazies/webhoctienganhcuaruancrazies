import { buildNextActions, type LiveSignals } from "../../core/insights";
import { buildLearnerSnapshot, type LearnerSnapshot } from "../../core/snapshot";
import { dayNo, displayStreak } from "../../core/streak";
import { dueCount, getProfile } from "../repo";
import { nowOf, type Ctx } from "./ctx";
import { getStoredMetrics, liveLevel } from "./insights";
import { getLevelStatuses } from "./levels";

/**
 * Learner snapshot của một người (giai đoạn 3): hồ sơ ĐÃ LƯU (không tính lại, không đọc answer_events) + tín hiệu tươi + gợi ý theo luật.
 * Chỉ 4 truy vấn nhỏ. Không chứa username/email/user_id (xem core/snapshot).
 *
 * KHÔNG BAO GIỜ ném lỗi: snapshot là dữ liệu phụ cho AI. Lỗi → null và nơi gọi chạy như cũ (chat không có ngữ cảnh, coach dùng câu chung).
 */
export async function getLearnerSnapshot(userId: string, ctx: Ctx = {}): Promise<LearnerSnapshot | null> {
  try {
    const now = nowOf(ctx);
    const [metrics, profile, due, statuses] = await Promise.all([getStoredMetrics(userId), getProfile(userId), dueCount(userId, now), getLevelStatuses(userId)]);
    if (!profile) return null;
    const live: LiveSignals = {
      now,
      dueCount: due,
      streak: displayStreak({ lastDay: profile.lastDay, streak: profile.streak, bestStreak: profile.bestStreak }, dayNo(now)),
      lastDay: profile.lastDay,
      level: liveLevel(statuses),
    };
    return buildLearnerSnapshot(metrics, live, buildNextActions(metrics, live));
  } catch (e) {
    console.error("[learner] snapshot", e instanceof Error ? e.message : e);
    return null;
  }
}
