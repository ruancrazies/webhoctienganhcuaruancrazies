import {
  actionHref,
  buildNextActions,
  computeInsights,
  describeAction,
  EMPTY_WEAK,
  INSIGHT_CFG,
  parseMetrics,
  weakProfileOf,
  type InsightMetrics,
  type LiveSignals,
  type WeakProfile,
} from "../../core/insights";
import { dayNo, displayStreak } from "../../core/streak";
import { GATED_LEVELS, type Cefr, type LevelStatus } from "../../core/types";
import type { ActionView, InsightsResponse } from "../../types/api";
import {
  dueCount,
  gameResponseMedians,
  getProfile,
  getUserInsights,
  overdueCount,
  recentAnswerEvents,
  recentExamPoints,
  recentRounds,
  recentSessions,
  saveUserInsights,
} from "../repo";
import { ServiceError } from "../errors";
import { nowOf, type Ctx } from "./ctx";
import { getLevelStatuses } from "./levels";

const DAY_MS = 86_400_000;
/** Trang /insights tính lại nếu hồ sơ đã lưu cũ hơn mức này (giá trị phụ thuộc ngày như số ngày có học đổi theo thời gian). */
const PAGE_STALE_MS = 6 * 3_600_000;
const MEDIANS_TTL_MS = 3_600_000;

let mediansCache: { at: number; value: Record<string, number> } | null = null;
/** Trung vị chung đổi chậm: giữ trong bộ nhớ 1 giờ. Lỗi thì dùng bản cũ hoặc rỗng (chỉ mất chỉ số tốc độ). */
async function medians(now: Date): Promise<Record<string, number>> {
  if (mediansCache && now.getTime() - mediansCache.at < MEDIANS_TTL_MS) return mediansCache.value;
  try {
    mediansCache = { at: now.getTime(), value: await gameResponseMedians() };
  } catch (e) {
    console.error("[insights] medians", e instanceof Error ? e.message : e);
    mediansCache ??= { at: now.getTime() - MEDIANS_TTL_MS + 60_000, value: {} }; // thử lại sau ~1 phút
  }
  return mediansCache.value;
}
export const resetInsightsCacheForTest = () => { mediansCache = null; };

/** Tính hồ sơ từ dữ liệu thô của một người (không lưu). */
export async function computeUserInsights(userId: string, ctx: Ctx = {}): Promise<InsightMetrics> {
  const now = nowOf(ctx);
  const since = new Date(now.getTime() - INSIGHT_CFG.windowDays * DAY_MS);
  const [events, rounds, sessions, exams, due, overdue, med] = await Promise.all([
    recentAnswerEvents(userId, since),
    recentRounds(userId, since),
    recentSessions(userId, since),
    recentExamPoints(userId),
    dueCount(userId, now),
    overdueCount(userId, now),
    medians(now),
  ]);
  return computeInsights({ now, events, rounds, sessions, exams, medians: med, review: { due, overdue2d: overdue } });
}

/** Tính và lưu. Gọi sau mỗi lần nộp bài (vòng chơi, bài thi, bài kiểm tra). */
export async function refreshUserInsights(userId: string, ctx: Ctx = {}): Promise<InsightMetrics> {
  const m = await computeUserInsights(userId, ctx);
  await saveUserInsights(userId, m, nowOf(ctx));
  return m;
}

/** Như refreshUserInsights nhưng không bao giờ ném lỗi: hồ sơ là dữ liệu phụ, không được làm hỏng việc nộp bài. */
export async function refreshInsightsSafe(userId: string, ctx: Ctx = {}): Promise<void> {
  try {
    await refreshUserInsights(userId, ctx);
  } catch (e) {
    console.error("[insights] refresh", e instanceof Error ? e.message : e);
  }
}

/** Hồ sơ đã lưu (null nếu chưa có hoặc không đọc được). KHÔNG tính lại: dùng ở đường nóng (bắt đầu vòng, trang chủ). */
export async function getStoredMetrics(userId: string): Promise<InsightMetrics | null> {
  const row = await getUserInsights(userId);
  return row ? parseMetrics(row.data) : null;
}

/** Hồ sơ yếu cho weak-first. Mọi lỗi → rỗng (vòng chơi chạy như cũ). */
export async function getWeakProfile(userId: string): Promise<WeakProfile> {
  try {
    return weakProfileOf(await getStoredMetrics(userId));
  } catch (e) {
    console.error("[insights] weak profile", e instanceof Error ? e.message : e);
    return EMPTY_WEAK;
  }
}

/** Cấp đang học (mở, chưa qua; qua hết thì C1) kèm số từ còn thiếu để được thi. */
export function liveLevel(statuses: readonly LevelStatus[]): LiveSignals["level"] {
  const cur = statuses.find((s) => s.unlocked && !s.pass && (GATED_LEVELS as readonly Cefr[]).includes(s.cefr));
  if (!cur) return { cefr: "C1", eligible: false, missingWords: 0 };
  return { cefr: cur.cefr, eligible: cur.eligible, missingWords: Math.max(0, cur.needLearned - cur.learnedCum) };
}

/** Hành động gợi ý đã kèm câu chữ và đường dẫn. `metrics` null (người mới) vẫn có gợi ý theo tín hiệu tươi. */
export function actionViews(metrics: InsightMetrics | null, live: LiveSignals): ActionView[] {
  return buildNextActions(metrics, live).map((a) => ({ reason: a.reason, ...describeAction(a), href: actionHref(a) }));
}

/** Dùng cho getHome: đã có sẵn hồ sơ người dùng, số từ đến hạn và trạng thái cấp nên không truy vấn thêm ngoài một dòng user_insights. */
export async function homeActions(
  userId: string,
  d: { now: Date; profile: { streak: number; lastDay: number | null; bestStreak: number }; dueCount: number; statuses: readonly LevelStatus[] },
): Promise<ActionView[]> {
  let metrics: InsightMetrics | null = null;
  try {
    metrics = await getStoredMetrics(userId);
  } catch (e) {
    console.error("[insights] home", e instanceof Error ? e.message : e); // trang chủ vẫn hiện, chỉ thiếu gợi ý theo hồ sơ
  }
  const today = dayNo(d.now);
  return actionViews(metrics, {
    now: d.now,
    dueCount: d.dueCount,
    streak: displayStreak({ lastDay: d.profile.lastDay, streak: d.profile.streak, bestStreak: d.profile.bestStreak }, today),
    lastDay: d.profile.lastDay,
    level: liveLevel(d.statuses),
  });
}

/** Trang /insights: hồ sơ năng lực + gợi ý. Tính lại nếu chưa có hoặc đã cũ. */
export async function getInsights(userId: string, ctx: Ctx = {}): Promise<InsightsResponse> {
  const now = nowOf(ctx);
  const stored = await getUserInsights(userId);
  let metrics = stored ? parseMetrics(stored.data) : null;
  if (!metrics || now.getTime() - Date.parse(metrics.asOf) > PAGE_STALE_MS) {
    metrics = await refreshUserInsights(userId, ctx);
  }

  const [profile, due, statuses] = await Promise.all([getProfile(userId), dueCount(userId, now), getLevelStatuses(userId)]);
  if (!profile) throw new ServiceError(404, "NO_PROFILE", "Không tìm thấy hồ sơ người dùng");
  const level = liveLevel(statuses);
  const live: LiveSignals = {
    now,
    dueCount: due,
    streak: displayStreak({ lastDay: profile.lastDay, streak: profile.streak, bestStreak: profile.bestStreak }, dayNo(now)),
    lastDay: profile.lastDay,
    level,
  };
  return { metrics, actions: actionViews(metrics, live), level: { ...level, learnedCum: statuses.find((s) => s.cefr === level.cefr)?.learnedCum ?? 0 }, dueCount: due, streak: live.streak };
}
