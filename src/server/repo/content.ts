import { createAdminClient } from "../db";
import { ServiceError } from "../errors";
import type { Cefr, GrammarQ, Sentence, Word } from "../../core/types";
import { toWord, unwrap, unwrapList, mapLimit, WORD_COLS, type WordRow } from "./shared";
import type { ResolvedScope } from "./scope";
import type { Scope } from "../../core/types";

const db = () => createAdminClient();

// ---------- chủ đề, lĩnh vực, bộ đếm ----------

export type TopicRow = { id: number; slug: string; title: string; emoji: string | null; cefr: Cefr; domain: string; sort: number | null };
export type DomainRow = { code: string; title: string; emoji: string | null };
export type ContentStat = { cefr: Cefr; domain: string; topic_id: number | null; word_count: number };

export async function topicBySlug(slug: string): Promise<TopicRow | null> {
  return unwrap<TopicRow>(
    "topics.bySlug",
    await db().from("topics").select("id,slug,title,emoji,cefr,domain,sort").eq("slug", slug).maybeSingle(),
  );
}

export async function allTopics(): Promise<TopicRow[]> {
  return unwrapList<TopicRow>("topics.all", await db().from("topics").select("id,slug,title,emoji,cefr,domain,sort").order("sort", { nullsFirst: false }).order("id"));
}

export async function allDomains(): Promise<DomainRow[]> {
  return unwrapList<DomainRow>("domains.all", await db().from("domains").select("code,title,emoji").order("code"));
}

/** Toàn bộ content_stats (vài trăm dòng): (cefr, domain, topic_id) → word_count. */
export async function allContentStats(): Promise<ContentStat[]> {
  return unwrapList<ContentStat>("content_stats.all", await db().from("content_stats").select("cefr,domain,topic_id,word_count"));
}

/** Slug → phạm vi đã phân giải; ném 404 nếu chủ đề không tồn tại. */
export async function resolveScope(scope: Scope): Promise<ResolvedScope> {
  if (scope.by === "level") return { cefr: scope.cefr, domain: scope.domain };
  const t = await topicBySlug(scope.topicSlug);
  if (!t) throw new ServiceError(404, "TOPIC_NOT_FOUND", "Không tìm thấy chủ đề");
  return { cefr: t.cefr, domain: t.domain, topicId: t.id };
}

// ---------- từ ----------

export async function wordsByIds(ids: number[]): Promise<Word[]> {
  if (!ids.length) return [];
  const rows = unwrapList<WordRow>("words.byIds", await db().from("words").select(WORD_COLS).in("id", ids).eq("status", "active"));
  return rows.map(toWord);
}

/** cefr/domain của các từ (kể cả từ không còn active: chỉ để kiểm tra khóa cấp). */
export async function wordMeta(ids: number[]): Promise<Map<number, { cefr: Cefr; domain: string; status: string }>> {
  if (!ids.length) return new Map();
  const rows = unwrapList<{ id: number; cefr: Cefr; domain: string; status: string }>(
    "words.meta",
    await db().from("words").select("id,cefr,domain,status").in("id", ids),
  );
  return new Map(rows.map((r) => [r.id, r]));
}

/** Các domain có từ ở một cấp, kèm số từ (để chọn domain theo trọng số khi scope.domain = "all"). */
async function domainWeights(cefr: Cefr): Promise<{ domain: string; count: number }[]> {
  const rows = unwrapList<{ domain: string; word_count: number }>(
    "content_stats.domains",
    await db().from("content_stats").select("domain,word_count").eq("cefr", cefr).is("topic_id", null),
  );
  return rows.filter((r) => r.word_count > 0).map((r) => ({ domain: r.domain, count: r.word_count }));
}

function weightedPick(list: { domain: string; count: number }[], rng: () => number): string | null {
  const total = list.reduce((s, x) => s + x.count, 0);
  if (!total) return null;
  let r = rng() * total;
  for (const x of list) {
    r -= x.count;
    if (r < 0) return x.domain;
  }
  return list[list.length - 1].domain;
}

/**
 * Trả hàm lấy `count` từ NGẪU NHIÊN trong phạm vi bằng cột rand + index (ADR-4, mục 5.4):
 *  - chủ đề: word_topics (topic_id, rand) rồi lấy từ theo id
 *  - cấp + domain cụ thể: words (cefr, domain, rand)
 *  - cấp + "all": chọn domain theo trọng số (content_stats) rồi như trên, vì index không sắp được rand xuyên domain
 * Mỗi lần gọi: rand >= r, thiếu thì quay vòng về đầu (rand < r). Có thể trả ít hơn `count` / trùng giữa các lần gọi.
 */
export async function randomWordPicker(scope: ResolvedScope): Promise<(count: number, rng: () => number) => Promise<Word[]>> {
  if (scope.topicId !== undefined) {
    const topicId = scope.topicId;
    return async (count, rng) => {
      const r = rng();
      const q = () => db().from("word_topics").select("word_id").eq("topic_id", topicId).order("rand");
      let ids = unwrapList<{ word_id: number }>("word_topics.pick", await q().gte("rand", r).limit(count)).map((x) => x.word_id);
      if (ids.length < count) {
        const more = unwrapList<{ word_id: number }>("word_topics.wrap", await q().lt("rand", r).limit(count - ids.length));
        ids = ids.concat(more.map((x) => x.word_id));
      }
      return wordsByIds(ids);
    };
  }

  const weights = scope.domain === "all" ? await domainWeights(scope.cefr) : [];
  return async (count, rng) => {
    const domain = scope.domain === "all" ? weightedPick(weights, rng) : scope.domain;
    if (!domain) return [];
    const r = rng();
    const q = () =>
      db().from("words").select(WORD_COLS).eq("cefr", scope.cefr).eq("domain", domain).eq("status", "active").order("rand");
    let rows = unwrapList<WordRow>("words.pick", await q().gte("rand", r).limit(count));
    if (rows.length < count) rows = rows.concat(unwrapList<WordRow>("words.wrap", await q().lt("rand", r).limit(count - rows.length)));
    return rows.map(toWord);
  };
}

export type RankedWord = Word & { freqRank: number };

/**
 * Danh sách học: keyset (freq_rank, id), không OFFSET (mục 4.5, 5.12). Lấy tối đa `limit` dòng.
 * LƯU Ý hiệu năng: scope cấp + domain "all" không dùng trọn index (cefr, domain, freq_rank, id) vì phải sắp xuyên domain
 * (vẫn là index scan theo cefr + top-N sort, không Seq Scan) — kiểm bằng EXPLAIN ở 200k từ.
 */
export async function listWordsByRank(
  scope: ResolvedScope,
  cursor: { rank: number; id: number } | null,
  limit: number,
): Promise<RankedWord[]> {
  const cols: string = scope.topicId !== undefined ? `${WORD_COLS},freq_rank,word_topics!inner(topic_id)` : `${WORD_COLS},freq_rank`;
  let q = db().from("words").select(cols).eq("status", "active");
  if (scope.topicId !== undefined) q = q.eq("word_topics.topic_id", scope.topicId);
  else {
    q = q.eq("cefr", scope.cefr);
    if (scope.domain !== "all") q = q.eq("domain", scope.domain);
  }
  if (cursor) q = q.or(`freq_rank.gt.${cursor.rank},and(freq_rank.eq.${cursor.rank},id.gt.${cursor.id})`);
  const rows = unwrapList<WordRow>("words.listByRank", await q.order("freq_rank").order("id").limit(limit));
  return rows.map((r) => ({ ...toWord(r), freqRank: r.freq_rank ?? 0 }));
}

// ---------- đáp án nhiễu ----------

type PoolRow = { id: number; en: string; vi: string; vi_alt: string[] | null };

async function randomRows(pos: string, cefr: Cefr, count: number, rng: () => number): Promise<PoolRow[]> {
  const r = rng();
  const q = () =>
    db().from("words").select("id,en,vi,vi_alt").eq("pos", pos).eq("cefr", cefr).eq("status", "active").order("rand");
  let rows = unwrapList<PoolRow>("words.distractors", await q().gte("rand", r).limit(count));
  if (rows.length < count) rows = rows.concat(unwrapList<PoolRow>("words.distractors.wrap", await q().lt("rand", r).limit(count - rows.length)));
  return rows;
}

const PER_WORD_DISTRACTORS = 5; // dư 2 so với cần (3) để core lọc trùng

/**
 * Đáp án nhiễu cho cả vòng. Gom từ theo (pos, cefr), mỗi nhóm lấy MỘT mẻ ứng viên (cefr đó, thiếu thì cấp liền kề)
 * qua index (pos, cefr, rand) rồi chia cho từng từ — thay vì một truy vấn mỗi từ.
 * Trả: vi (nghĩa tiếng Việt của từ khác) cho quiz/blitz/listen; en (từ tiếng Anh khác) cho cloze dạng chọn.
 */
export async function distractorPools(
  words: Word[],
  rng: () => number,
): Promise<{ vi: Record<number, string[]>; en: Record<number, string[]> }> {
  const groups = new Map<string, Word[]>();
  for (const w of words) {
    const k = `${w.pos}|${w.cefr}`;
    groups.set(k, [...(groups.get(k) ?? []), w]);
  }

  const vi: Record<number, string[]> = {};
  const en: Record<number, string[]> = {};
  const nearOf = (c: Cefr): Cefr[] => {
    const order: Cefr[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
    const i = order.indexOf(c);
    return [c, order[i - 1], order[i + 1]].filter((x): x is Cefr => !!x);
  };

  await mapLimit([...groups.values()], 4, async (group) => {
    const { pos, cefr } = group[0];
    const need = group.length * PER_WORD_DISTRACTORS + 4;
    const own = new Set(group.map((w) => w.id));
    const pool = new Map<number, PoolRow>();
    for (const c of nearOf(cefr)) {
      if (pool.size >= need) break;
      for (const row of await randomRows(pos, c, need - pool.size + own.size, rng)) if (!own.has(row.id)) pool.set(row.id, row);
    }
    const list = [...pool.values()];
    group.forEach((w, k) => {
      const banned = new Set([w.vi, ...(w.viAlt ?? [])].map((s) => s.normalize("NFC").trim()));
      const viOut: string[] = [];
      const enOut: string[] = [];
      for (let j = 0; j < list.length && (viOut.length < PER_WORD_DISTRACTORS || enOut.length < PER_WORD_DISTRACTORS); j++) {
        const row = list[(k * 3 + j) % list.length]; // xoay vòng để mỗi từ nhận bộ nhiễu khác nhau
        if (viOut.length < PER_WORD_DISTRACTORS && !banned.has(row.vi.normalize("NFC").trim())) viOut.push(row.vi);
        if (enOut.length < PER_WORD_DISTRACTORS && row.en.toLowerCase() !== w.en.toLowerCase()) enOut.push(row.en);
      }
      vi[w.id] = viOut;
      en[w.id] = enOut;
    });
  });
  return { vi, en };
}

// ---------- câu ví dụ ----------

type SentenceRow = { sentence_id: number; sentences: { id: number; en: string; vi: string | null; cefr: Cefr | null; kind: string | null } };

/**
 * Tối đa `per` câu active cho MỖI từ (sentence_words PK (word_id, sentence_id)). Một truy vấn mỗi từ, chạy song song có giới hạn:
 * PostgREST không có "LIMIT theo nhóm". Thứ tự cố định theo sentence_id (không ngẫu nhiên) — nếu cần đa dạng hơn thì
 * thêm hàm SQL lateral ở migration sau.
 */
export async function sentencesFor(wordIds: number[], per: number): Promise<Record<number, Sentence[]>> {
  const out: Record<number, Sentence[]> = {};
  await mapLimit(wordIds, 8, async (wordId) => {
    const rows = unwrapList<SentenceRow>(
      "sentence_words.for",
      await db()
        .from("sentence_words")
        .select("sentence_id,sentences!inner(id,en,vi,cefr,kind,status)")
        .eq("word_id", wordId)
        .eq("sentences.status", "active")
        .order("sentence_id")
        .limit(per),
    );
    out[wordId] = rows.map((r) => ({ id: r.sentences.id, en: r.sentences.en, vi: r.sentences.vi, cefr: r.sentences.cefr, kind: r.sentences.kind }));
  });
  return out;
}

// ---------- ngữ pháp ----------

type GrammarRow = { id: number; level: Cefr; topic: string | null; question: string; options: unknown; answer: number; explanation: string | null };

function toGrammar(r: GrammarRow): GrammarQ | null {
  if (!Array.isArray(r.options)) return null;
  const options = r.options.map(String);
  if (r.answer < 1 || r.answer > options.length) return null;
  return { id: r.id, level: r.level, topic: r.topic, question: r.question, options, answer: r.answer, explanation: r.explanation };
}

/** `n` câu ngữ pháp ngẫu nhiên của đúng cấp (cột rand, index (level, rand)); quay vòng khi thiếu. */
export async function pickGrammar(level: Cefr, n: number, rng: () => number): Promise<GrammarQ[]> {
  const r = rng();
  const q = () =>
    db().from("grammar_questions").select("id,level,topic,question,options,answer,explanation").eq("level", level).eq("status", "active").order("rand");
  let rows = unwrapList<GrammarRow>("grammar.pick", await q().gte("rand", r).limit(n));
  if (rows.length < n) rows = rows.concat(unwrapList<GrammarRow>("grammar.wrap", await q().lt("rand", r).limit(n - rows.length)));
  return rows.map(toGrammar).filter((g): g is GrammarQ => g !== null);
}

/** `n` từ ngẫu nhiên của lĩnh vực `domain` trong cấp, trừ `exclude` (đề thi, mục 4.6). */
export async function pickWordsForExam(cefr: Cefr, domain: string, n: number, exclude: Set<number>, rng: () => number): Promise<Word[]> {
  const pick = await randomWordPicker({ cefr, domain });
  const out = new Map<number, Word>();
  for (let attempt = 0; attempt < 4 && out.size < n; attempt++) {
    for (const w of await pick(Math.max(n - out.size, 5) * 2, rng)) if (!exclude.has(w.id) && !out.has(w.id)) out.set(w.id, w);
  }
  // Cấp quá ít từ: thà dùng lại từ đã thi lượt trước còn hơn đề thiếu câu.
  if (out.size < n && exclude.size) {
    for (const w of await pick(n * 2, rng)) if (!out.has(w.id)) out.set(w.id, w);
  }
  return [...out.values()].slice(0, n);
}

// ---------- danh sách học: từ mới / ôn lại (migration 0005) ----------

/** Từ kèm khóa phân trang của chính nó: `${freq_rank}:${id}` (từ mới) hoặc `${micro-giây next_review}:${id}` (ôn lại). */
export type PagedWord = Word & { pageKey: string };

async function wordsInOrder(label: string, ids: number[]): Promise<Map<number, Word>> {
  if (!ids.length) return new Map();
  const rows = unwrapList<WordRow>(label, await db().from("words").select(WORD_COLS).in("id", ids).eq("status", "active"));
  return new Map(rows.map((r) => [r.id, toWord(r)]));
}

const scopeArgs = (scope: ResolvedScope) => ({
  p_cefr: scope.cefr,
  p_domain: scope.domain,
  p_topic: scope.topicId ?? null,
});

/** Từ MỚI: người dùng chưa có tiến độ nào. Keyset (freq_rank, id), lấy tối đa `limit`. */
export async function listNewWords(userId: string, scope: ResolvedScope, cursor: { a: number; id: number } | null, limit: number): Promise<PagedWord[]> {
  const rows = unwrapList<{ id: number; freq_rank: number }>(
    "rpc.list_new_words",
    await db().rpc("list_new_words", { p_user: userId, ...scopeArgs(scope), p_rank: cursor?.a ?? null, p_id: cursor?.id ?? null, p_limit: limit }),
  );
  const words = await wordsInOrder("words.newByIds", rows.map((r) => r.id));
  return rows.flatMap((r) => {
    const w = words.get(r.id);
    return w ? [{ ...w, pageKey: `${r.freq_rank}:${r.id}` }] : [];
  });
}

/** Từ ĐÃ có tiến độ (ôn lại): đến hạn trước. Con trỏ (micro-giây next_review, id). */
export async function listReviewWords(userId: string, scope: ResolvedScope, cursor: { a: number; id: number } | null, limit: number): Promise<PagedWord[]> {
  const rows = unwrapList<{ id: number; next_us: number }>(
    "rpc.list_review_words",
    await db().rpc("list_review_words", { p_user: userId, ...scopeArgs(scope), p_after_us: cursor?.a ?? null, p_id: cursor?.id ?? null, p_limit: limit }),
  );
  const words = await wordsInOrder("words.reviewByIds", rows.map((r) => r.id));
  return rows.flatMap((r) => {
    const w = words.get(r.id);
    return w ? [{ ...w, pageKey: `${r.next_us}:${r.id}` }] : [];
  });
}
