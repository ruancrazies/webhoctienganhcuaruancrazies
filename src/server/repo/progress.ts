import { createAdminClient } from "../db";
import { RepoError } from "../errors";
import type { Cefr, LevelCounters, SrsState, Word } from "../../core/types";
import { CEFR_ORDER } from "../../core/types";
import { shuffle } from "../../core/questions";
import { allContentStats, randomWordPicker, type ContentStat } from "./content";
import type { ResolvedScope } from "./scope";
import { chunk, toWord, unwrapList, WORD_COLS, type WordRow } from "./shared";

const db = () => createAdminClient();

const DUE_POOL_FACTOR = 3; // lấy dư gấp 3 lần số từ cần rồi chọn ngẫu nhiên
const DUE_POOL_MIN = 30;

export type ProgressRow = { word_id: number; level: number; bad: number; next_review: string };

/** Tiến độ của các từ (PK user_id + word_id, ≤ vài chục id/lần). */
export async function progressFor(userId: string, wordIds: number[]): Promise<Map<number, SrsState>> {
  const out = new Map<number, SrsState>();
  for (const ids of chunk([...new Set(wordIds)], 100)) {
    const rows = unwrapList<ProgressRow>(
      "progress.for",
      await db().from("user_word_progress").select("word_id,level,bad,next_review").eq("user_id", userId).in("word_id", ids),
    );
    for (const r of rows) out.set(r.word_id, { level: r.level, bad: r.bad, nextReview: new Date(r.next_review) });
  }
  return out;
}

async function progressIds(userId: string, ids: number[]): Promise<Set<number>> {
  return new Set([...(await progressFor(userId, ids)).keys()]);
}

/**
 * Từ ĐẾN HẠN ôn trong phạm vi: lọc cefr/domain/chủ đề NGAY TRONG truy vấn rồi mới LIMIT (mục 5.4) —
 * lấy LIMIT trước rồi lọc sau thì từ đến hạn của cấp khác chiếm hết chỗ. Index (user_id, cefr, domain, next_review).
 */
async function dueWords(userId: string, scope: ResolvedScope, n: number, now: Date, rng: () => number): Promise<Word[]> {
  const topic = scope.topicId !== undefined;
  const embed = topic ? `words!inner(${WORD_COLS},word_topics!inner(topic_id))` : `words!inner(${WORD_COLS})`;
  let q = db()
    .from("user_word_progress")
    .select(`word_id,${embed}`)
    .eq("user_id", userId)
    .lte("next_review", now.toISOString())
    .eq("cefr", scope.cefr)
    .eq("words.status", "active");
  if (topic) q = q.eq("words.word_topics.topic_id", scope.topicId);
  else if (scope.domain !== "all") q = q.eq("domain", scope.domain);
  // Lấy dư một nhóm từ đến hạn sớm nhất rồi chọn ngẫu nhiên n từ trong đó: nếu chỉ lấy n từ đầu theo next_review
  // thì các từ học cùng lúc (cùng next_review) luôn ra đúng một bộ, theo thứ tự id = bảng chữ cái.
  const rows = unwrapList<{ words: WordRow }>("progress.due", await q.order("next_review").limit(Math.max(n * DUE_POOL_FACTOR, DUE_POOL_MIN)));
  return shuffle(rows.map((r) => toWord(r.words)), rng).slice(0, n);
}

/** Từ MỚI (chưa có tiến độ): lấy ngẫu nhiên theo rand, lấy dư rồi loại từ đã có tiến độ. */
async function newWords(userId: string, scope: ResolvedScope, need: number, exclude: Set<number>, rng: () => number): Promise<Word[]> {
  const MAX_TRIES = 6;
  const pick = await randomWordPicker(scope);
  const seen = new Set(exclude);
  const out: Word[] = [];
  let stale = 0;
  for (let t = 0; t < MAX_TRIES && out.length < need && stale < 2; t++) {
    const fresh = (await pick((need - out.length) * 3, rng)).filter((w) => !seen.has(w.id));
    if (!fresh.length) {
      stale++;
      continue;
    }
    for (const w of fresh) seen.add(w.id);
    // Đã có dòng tiến độ = hoặc đã nằm trong danh sách "đến hạn", hoặc đã thuộc và chưa đến hạn → không phải từ mới.
    const known = await progressIds(userId, fresh.map((w) => w.id));
    for (const w of fresh) if (!known.has(w.id) && out.length < need) out.push(w);
  }
  return out;
}

export type PickResult = { words: Word[]; practice: boolean };

/**
 * Chọn từ cho một vòng (mục 5.4): đến hạn ôn → từ mới → (không còn gì) chế độ luyện tập.
 * preferNew (trò flash): từ mới trước, đến hạn bù sau.
 * practice = true khi không có từ đến hạn lẫn từ mới: lấy từ ngẫu nhiên trong phạm vi bất kể tiến độ.
 */
export async function pickWords(userId: string, scope: ResolvedScope, n: number, preferNew: boolean, rng: () => number, now: Date): Promise<PickResult> {
  let words: Word[] = [];
  const add = (list: Word[]) => {
    const have = new Set(words.map((w) => w.id));
    words = words.concat(list.filter((w) => !have.has(w.id))).slice(0, n);
  };

  if (preferNew) {
    add(await newWords(userId, scope, n, new Set(), rng));
    if (words.length < n) add(await dueWords(userId, scope, n - words.length, now, rng));
  } else {
    add(await dueWords(userId, scope, n, now, rng));
    if (words.length < n) add(await newWords(userId, scope, n - words.length, new Set(words.map((w) => w.id)), rng));
  }
  // Xáo lại cả vòng: từ đến hạn và từ mới được ghép nối tiếp, và truy vấn `in (...)` trả theo id (= bảng chữ cái).
  if (words.length > 0) return { words: shuffle(words, rng), practice: false };

  const pick = await randomWordPicker(scope);
  for (let t = 0; t < 3 && words.length < n; t++) add(await pick(n * 2, rng));
  return { words: shuffle(words, rng), practice: true };
}

export async function dueCount(userId: string, now: Date): Promise<number> {
  const { count, error } = await db()
    .from("user_word_progress")
    .select("word_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .lte("next_review", now.toISOString());
  if (error) throw new RepoError("progress.dueCount", error.message, error.code);
  return count ?? 0;
}

// ---------- bộ đếm cấp, cấp đã qua ----------

export type UserLevelStat = { cefr: Cefr; domain: string; learned: number; mastered: number };

export async function userLevelStats(userId: string): Promise<UserLevelStat[]> {
  return unwrapList<UserLevelStat>("uls.all", await db().from("user_level_stats").select("cefr,domain,learned,mastered").eq("user_id", userId));
}

export async function levelPasses(userId: string): Promise<Set<Cefr>> {
  const rows = unwrapList<{ cefr: Cefr }>("level_passes.get", await db().from("level_passes").select("cefr").eq("user_id", userId));
  return new Set(rows.map((r) => r.cefr));
}

/** LevelCounters (chỉ lĩnh vực general) từ bộ đếm có sẵn — không đụng bảng words. */
export function countersFrom(stats: UserLevelStat[], content: ContentStat[]): LevelCounters[] {
  return CEFR_ORDER.map((cefr) => ({
    cefr,
    learned: stats.filter((s) => s.cefr === cefr && s.domain === "general").reduce((a, s) => a + s.learned, 0),
    total: content.find((c) => c.cefr === cefr && c.domain === "general" && c.topic_id === null)?.word_count ?? 0,
  }));
}

export async function levelCounters(userId: string): Promise<LevelCounters[]> {
  const [stats, content] = await Promise.all([userLevelStats(userId), allContentStats()]);
  return countersFrom(stats, content);
}

/** RPC mark_learned: một giao dịch. Trả số từ thực sự được đưa lên level 1. */
export async function markLearned(userId: string, wordIds: number[]): Promise<number> {
  const { data, error } = await db().rpc("mark_learned", { p_user: userId, p_word_ids: wordIds });
  if (error) throw new RepoError("rpc.mark_learned", error.message, error.code);
  return Number(data ?? 0);
}
