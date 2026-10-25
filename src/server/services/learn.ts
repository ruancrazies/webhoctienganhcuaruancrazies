import { learnState } from "../../core/srs";
import type { LearnCard, LearnPage, LearnQuery, MarkLearnedRequest } from "../../types/api";
import { ServiceError } from "../errors";
import { HOUR, LEARN_MARK_PER_HOUR, LEARN_LIST_PER_MINUTE, MINUTE } from "../limits";
import { hitRateLimit } from "../ratelimit";
import { listNewWords, listReviewWords, markLearned as repoMarkLearned, progressFor, resolveScope, sentencesFor, wordMeta } from "../repo";
import { nowOf, type Ctx } from "./ctx";
import { getLevelStatuses, requireUnlocked } from "./levels";
import { recordQuestProgress } from "./quests";

/** Mỗi lần hiển thị 50 từ; muốn xem tiếp thì bấm "Làm mới" (thay danh sách, không nối dài). */
export const LEARN_PAGE_SIZE = 50;
const EXAMPLES_PER_WORD = 3;

function decodeCursor(raw: string | undefined): { a: number; id: number } | null {
  if (!raw) return null;
  const m = /^(\d{1,16}):(\d{1,15})$/.exec(raw);
  if (!m) throw new ServiceError(400, "BAD_CURSOR", "Con trỏ phân trang không hợp lệ");
  return { a: Number(m[1]), id: Number(m[2]) };
}

/**
 * Mục 5.12: danh sách để học, keyset 50 từ/lượt, kèm trạng thái và ≤3 câu ví dụ.
 *  - mode "new": từ CHƯA có tiến độ, theo thứ tự tần suất.
 *  - mode "review": từ ĐÃ có tiến độ, đến hạn ôn trước.
 */
export async function listLearn(query: LearnQuery, userId: string): Promise<LearnPage> {
  if (!(await hitRateLimit(`learn-list:${userId}`, MINUTE, LEARN_LIST_PER_MINUTE))) {
    throw new ServiceError(429, "RATE_LIMITED", "Bạn thao tác quá nhanh");
  }

  const scope = await resolveScope(query.scope);
  await requireUnlocked(userId, scope.cefr);

  // lấy dư một dòng để biết còn trang sau hay không
  const list = query.mode === "review" ? listReviewWords : listNewWords;
  const rows = await list(userId, scope, decodeCursor(query.cursor), LEARN_PAGE_SIZE + 1);
  const hasMore = rows.length > LEARN_PAGE_SIZE;
  const page = rows.slice(0, LEARN_PAGE_SIZE);
  const ids = page.map((w) => w.id);

  const [progress, examples] = await Promise.all([progressFor(userId, ids), sentencesFor(ids, EXAMPLES_PER_WORD)]);

  const items: LearnCard[] = page.map((w) => ({
    wordId: w.id,
    key: w.key,
    en: w.en,
    pos: w.pos,
    vi: w.vi,
    viAlt: w.viAlt ?? [],
    ipa: w.ipa,
    cefr: w.cefr,
    domain: w.domain,
    state: learnState(progress.get(w.id)),
    examples: (examples[w.id] ?? []).map((s) => ({ en: s.en, vi: s.vi })),
  }));

  const last = page[page.length - 1];
  return { items, nextCursor: hasMore && last ? last.pageKey : undefined, mode: query.mode };
}

/**
 * Mục 5.12: đánh dấu "đã học" (≤ 50 từ). Từ chưa có tiến độ / đang level 0 → level 1; không XP, không "thuộc".
 * Chỉ cho đánh dấu từ của cấp ĐÃ MỞ: nếu không, người dùng có thể "học" từ cấp khóa để tăng vốn từ cộng dồn
 * và được vào thi sớm.
 */
export async function markLearned(req: MarkLearnedRequest, userId: string, ctx: Ctx = {}): Promise<{ marked: number }> {
  const ids = [...new Set(req.wordIds)];
  if (ids.length === 0 || ids.length > 50) throw new ServiceError(400, "BAD_REQUEST", "Mỗi lần đánh dấu tối đa 50 từ");

  if (!(await hitRateLimit(`learn-mark:${userId}`, HOUR, LEARN_MARK_PER_HOUR))) {
    throw new ServiceError(429, "RATE_LIMITED", "Bạn thao tác quá nhiều, hãy nghỉ một chút");
  }

  const [meta, statuses] = await Promise.all([wordMeta(ids), getLevelStatuses(userId)]);
  const unlocked = new Set(statuses.filter((s) => s.unlocked).map((s) => s.cefr));
  for (const id of ids) {
    const m = meta.get(id);
    if (!m) throw new ServiceError(404, "WORD_NOT_FOUND", "Có từ không tồn tại", { wordId: id });
    if (!unlocked.has(m.cefr)) throw new ServiceError(403, "LEVEL_LOCKED", "Có từ thuộc cấp đang khóa", { wordId: id, cefr: m.cefr });
  }

  const marked = await repoMarkLearned(userId, ids);
  await recordQuestProgress(userId, { learn: marked, review: 0, play: 0 }, { now: nowOf(ctx) });
  return { marked };
}
