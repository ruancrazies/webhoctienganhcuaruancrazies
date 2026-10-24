import { levelStatus } from "../../core/levels";
import { DAILY_XP_CAP } from "../../core/rules";
import { dayNo, displayStreak } from "../../core/streak";
import { CEFR_ORDER } from "../../core/types";
import type { HomeLevel, HomeResponse } from "../../types/api";
import { getConfig } from "../config";
import { ServiceError } from "../errors";
import { allContentStats, allDomains, allTopics, countersFrom, dueCount, getProfile, levelPasses, userLevelStats } from "../repo";
import { nowOf, type Ctx } from "./ctx";

/**
 * Dữ liệu trang chủ và trang chọn lĩnh vực/chủ đề: hồ sơ, số từ đến hạn ôn, và mỗi cấp gồm trạng thái khóa/thi,
 * tiến độ (general), từng lĩnh vực, từng chủ đề. Chỉ đọc bảng nhỏ (bộ đếm, domains, topics), không đụng words.
 */
export async function getHome(userId: string, ctx: Ctx = {}): Promise<HomeResponse> {
  const now = nowOf(ctx);
  const today = dayNo(now);
  const cfg = getConfig();

  const [profile, due, stats, content, passes, domains, topics] = await Promise.all([
    getProfile(userId),
    dueCount(userId, now),
    userLevelStats(userId),
    allContentStats(),
    levelPasses(userId),
    allDomains(),
    allTopics(),
  ]);
  if (!profile) throw new ServiceError(404, "NO_PROFILE", "Không tìm thấy hồ sơ người dùng");

  const statuses = levelStatus(countersFrom(stats, content), passes, cfg.levels);
  const totalOf = (cefr: string, domain: string, topicId: number | null) =>
    content.find((c) => c.cefr === cefr && c.domain === domain && c.topic_id === topicId)?.word_count ?? 0;

  const levels: HomeLevel[] = CEFR_ORDER.map((cefr) => {
    const status = statuses.find((s) => s.cefr === cefr)!;
    const mine = stats.filter((s) => s.cefr === cefr);
    const sum = (domain: string, key: "learned" | "mastered") => mine.filter((s) => s.domain === domain).reduce((a, s) => a + s[key], 0);

    return {
      ...status,
      total: totalOf(cefr, "general", null),
      learned: sum("general", "learned"),
      mastered: sum("general", "mastered"),
      domains: domains
        .map((d) => ({ code: d.code, title: d.title, emoji: d.emoji, total: totalOf(cefr, d.code, null), learned: sum(d.code, "learned"), mastered: sum(d.code, "mastered") }))
        .filter((d) => d.total > 0),
      topics: topics
        .filter((t) => t.cefr === cefr)
        .map((t) => ({ slug: t.slug, title: t.title, emoji: t.emoji, domain: t.domain, total: totalOf(cefr, t.domain, t.id) }))
        .filter((t) => t.total > 0),
    };
  });

  return {
    profile: {
      username: profile.username,
      xp: profile.xp,
      streak: displayStreak({ lastDay: profile.lastDay, streak: profile.streak, bestStreak: profile.bestStreak }, today),
      bestStreak: profile.bestStreak,
      xpToday: profile.xpDay === today ? profile.xpToday : 0,
      dailyXpCap: DAILY_XP_CAP,
    },
    dueCount: due,
    levels,
  };
}
