import { SKILLS, SKILL_GAME, SKILL_LABEL, skillOf, type Skill } from "./skills";
import { dayNo } from "./streak";
import type { Cefr, GameId } from "./types";

/**
 * Hồ sơ năng lực và bộ gợi ý theo luật (giai đoạn 2, thiết kế mục 6). Hàm thuần: không đụng DB/HTTP/đồng hồ
 * (`now` do người gọi truyền vào) nên test được bằng vitest.
 *
 * Hai nửa:
 *   - computeInsights(): từ các sự kiện thô (answer_events, vòng chơi, phiên, điểm bài thi) → InsightMetrics (JSON, lưu ở user_insights).
 *   - buildNextActions(): từ InsightMetrics + tín hiệu TƯƠI (số từ đến hạn, chuỗi ngày, ...) → tối đa 3 hành động kèm mã lý do.
 *     Tách đôi vì có tín hiệu đổi theo thời gian mà không cần ai nộp bài (chuỗi sắp đứt, vắng nhiều ngày, từ đến hạn).
 *
 * LLM không chọn hành động; ở giai đoạn 3 nó chỉ diễn đạt lý do (mục 8). describeAction() là câu dự phòng theo template.
 *
 * Công thức làm mượt tỉ lệ sai trong SQL (analytics.*, báo cáo toàn hệ thống) khác với công thức ở đây (điểm yếu của TỪNG
 * người, trọng số giảm theo thời gian): hai công thức phục vụ hai mục đích khác nhau.
 */

// ---------------------------------------------------------------------------
// Hệ số (giá trị khởi đầu, chỉnh sau khi có dữ liệu thật)
// ---------------------------------------------------------------------------

export type InsightCfg = {
  /** Chỉ xét sự kiện trong ngần này ngày gần nhất. */
  windowDays: number;
  /** Chu kỳ bán rã của trọng số theo thời gian (ngày). */
  halfLifeDays: number;
  /** Điểm yếu: tối thiểu ngần này câu trong nhóm. */
  weakMinN: number;
  /** Điểm yếu: độ chính xác (có trọng số) dưới ngưỡng này. */
  weakAccuracy: number;
  /** Số điểm yếu giữ lại. */
  weakTop: number;
  /** Kỹ năng: tối thiểu ngần này câu mới đưa ra điểm. */
  skillMinN: number;
  /** Kỹ năng yếu "rõ rệt": thấp hơn trung bình các kỹ năng còn lại ít nhất ngần này (0–1). */
  skillGap: number;
  /** Xu hướng: mỗi nửa (7 ngày gần nhất / 7 ngày trước đó) cần tối thiểu ngần này câu. */
  trendMinN: number;
  /** Từ đến hạn ôn từ ngần này trở lên thì coi là tồn đọng. */
  dueBacklogMin: number;
  /** Sẵn sàng thi: độ chính xác gần đây tối thiểu và số câu tối thiểu. */
  readyMinAccuracy: number;
  readyMinN: number;
  /** Vắng ngần này ngày trở lên → vòng ôn nhẹ. */
  longAbsenceDays: number;
  /** Chuỗi tối thiểu để nhắc "sắp mất chuỗi". */
  streakRiskMin: number;
  /** Weak-first: tối đa tỉ lệ số câu của một vòng dành cho từ thuộc nhóm yếu (để vòng không đơn điệu). */
  weakShare: number;
  /** Số hành động tối đa. */
  maxActions: number;
  /** Số giờ hay học / trò hay chơi giữ lại. */
  topHours: number;
  topGames: number;
  /** Vòng chơi chưa nộp quá ngần này giờ mới tính là bỏ dở (vòng vừa mở vẫn còn đang chơi). */
  abandonAfterHours: number;
};

export const INSIGHT_CFG: InsightCfg = {
  windowDays: 60,
  halfLifeDays: 14,
  weakMinN: 5,
  weakAccuracy: 0.7,
  weakTop: 5,
  skillMinN: 8,
  skillGap: 0.15,
  trendMinN: 3,
  dueBacklogMin: 15,
  readyMinAccuracy: 0.75,
  readyMinN: 20,
  longAbsenceDays: 5,
  streakRiskMin: 2,
  weakShare: 0.6,
  maxActions: 3,
  topHours: 3,
  topGames: 3,
  abandonAfterHours: 1,
};

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const VN_OFFSET_MS = 7 * HOUR_MS;

// ---------------------------------------------------------------------------
// Kiểu dữ liệu
// ---------------------------------------------------------------------------

/** Một câu đã trả lời (cột của answer_events). */
export type InsightEvent = {
  game: string;
  part: string;
  correct: boolean;
  hintUsed: boolean;
  /** Tín hiệu mềm do trình duyệt báo; null = không có số đo. */
  responseMs: number | null;
  at: Date;
  cefr: Cefr | null;
  pos: string | null;
  domain: string | null;
  grammarTopic: string | null;
};

export type InsightRound = { game: string; createdAt: Date; finishedAt: Date | null };
/** Một phiên học (nhóm activity_events cùng session_id). */
export type InsightSession = { start: Date; end: Date; events: number };
/** Điểm một bài đã nộp, thang 0..1. */
export type ExamPoint = {
  at: Date;
  kind: "exam" | "practice";
  cefr: Cefr | null;
  total: number;
  vocab: number;
  grammar: number;
  reading: number | null;
  listening: number | null;
  passed: boolean | null;
};

export type InsightInput = {
  now: Date;
  events: readonly InsightEvent[];
  rounds: readonly InsightRound[];
  sessions: readonly InsightSession[];
  exams: readonly ExamPoint[];
  /** Trung vị response_ms toàn hệ thống theo game (analytics: game_response_medians). Thiếu game nào thì bỏ qua game đó. */
  medians: Readonly<Record<string, number>>;
  /** Từ đang đến hạn ôn, và trong đó bao nhiêu từ quá hạn hơn 2 ngày. */
  review: { due: number; overdue2d: number };
};

export type SkillStat = {
  skill: Skill;
  /** Độ chính xác có trọng số theo thời gian, 0..1; null khi chưa có câu nào. */
  acc: number | null;
  n: number;
  /** Chênh lệch độ chính xác: 7 ngày gần nhất trừ 7 ngày trước đó; null khi một nửa chưa đủ mẫu. */
  trend: number | null;
};

export type WeakKind = "grammar_topic" | "vocab_pos" | "vocab_domain";

export type WeakItem = {
  kind: WeakKind;
  /** Khoá ổn định, ví dụ "grammar_topic:B1:tenses". */
  key: string;
  label: string;
  cefr: Cefr | null;
  pos?: string;
  domain?: string;
  topic?: string;
  acc: number;
  n: number;
  /** (1 − acc) × log(1 + n) × độ mới. Lớn hơn = yếu hơn và đáng luyện hơn. */
  score: number;
};

export type ExamPart = "vocab" | "grammar" | "reading" | "listening";

export type InsightMetrics = {
  v: 1;
  asOf: string;
  windowDays: number;
  /** Số câu trong cửa sổ. */
  samples: number;
  overall: { acc: number | null; n: number; trend: number | null };
  skills: SkillStat[];
  weak: WeakItem[];
  behavior: {
    /** Giờ trong ngày (giờ Việt Nam) học nhiều nhất, nhiều nhất trước. */
    usualHours: number[];
    sessions: number;
    sessionMedianMin: number | null;
    favoriteGames: { game: string; rounds: number }[];
    roundsStarted: number;
    /** Tỉ lệ vòng bỏ dở (chỉ tính vòng đã mở quá abandonAfterHours giờ); null khi chưa có vòng nào đủ tuổi. */
    abandonRate: number | null;
    /** Trung vị của (thời gian của bạn / trung vị chung cùng game). 1 = bằng mức chung; null khi thiếu số đo. */
    speedRatio: number | null;
    hintRate: number | null;
    /** Số ngày (giờ VN) có học trong 14 ngày gần nhất. */
    activeDays14: number;
    /** Số thứ tự ngày (core/streak.dayNo) của câu trả lời gần nhất; null nếu chưa có. */
    lastActiveDay: number | null;
    /** Tỉ lệ từ đang đến hạn mà quá hạn hơn 2 ngày; null khi không có từ đến hạn. */
    overdueShare: number | null;
  };
  exams: {
    count: number;
    /** Điểm gần nhất theo phần và điểm của bài trước đó (null nếu phần đó không có ở bài). */
    parts: Record<ExamPart, { last: number | null; prev: number | null }>;
    lastTotal: number | null;
    prevTotal: number | null;
  };
};

// ---------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

/** Trọng số giảm dần theo tuổi: 1 lúc vừa xong, 0.5 sau một chu kỳ bán rã. */
export function decayWeight(ageMs: number, halfLifeDays: number): number {
  return 0.5 ** (Math.max(0, ageMs) / DAY_MS / halfLifeDays);
}

/** Bộ cộng dồn độ chính xác có trọng số. */
class Acc {
  w = 0;
  wc = 0;
  n = 0;
  latest = 0;
  add(correct: boolean, at: number, now: number, halfLife: number) {
    const w = decayWeight(now - at, halfLife);
    this.w += w;
    if (correct) this.wc += w;
    this.n += 1;
    if (at > this.latest) this.latest = at;
  }
  get acc(): number | null {
    return this.w > 0 ? this.wc / this.w : null;
  }
}

/** Độ chính xác thô (không trọng số) của các sự kiện trong [from, to). null nếu ít hơn `minN` câu. */
function rawAcc(evs: readonly { correct: boolean; at: number }[], from: number, to: number, minN: number): number | null {
  let n = 0;
  let c = 0;
  for (const e of evs) {
    if (e.at >= from && e.at < to) {
      n++;
      if (e.correct) c++;
    }
  }
  return n >= minN ? c / n : null;
}

/** Hai nửa 7 ngày liền kề → chênh lệch (gần − trước); null khi một nửa chưa đủ mẫu. */
function trendOf(evs: readonly { correct: boolean; at: number }[], now: number, minN: number): number | null {
  const recent = rawAcc(evs, now - 7 * DAY_MS, now + 1, minN);
  const prev = rawAcc(evs, now - 14 * DAY_MS, now - 7 * DAY_MS, minN);
  return recent === null || prev === null ? null : round4(recent - prev);
}

export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Giờ trong ngày theo giờ Việt Nam (0–23). */
export const vnHour = (ms: number): number => new Date(ms + VN_OFFSET_MS).getUTCHours();

const POS_VI: Record<string, string> = {
  n: "danh từ", v: "động từ", adj: "tính từ", adv: "trạng từ", prep: "giới từ", conj: "liên từ", pron: "đại từ",
  det: "từ hạn định", interj: "thán từ", num: "số từ", modal: "động từ khuyết thiếu", aux: "trợ động từ", phr: "cụm từ",
};
export const posLabel = (pos: string): string => POS_VI[pos] ?? pos;

// ---------------------------------------------------------------------------
// computeInsights
// ---------------------------------------------------------------------------

export function computeInsights(input: InsightInput, cfgOver: Partial<InsightCfg> = {}): InsightMetrics {
  const cfg: InsightCfg = { ...INSIGHT_CFG, ...cfgOver };
  const now = input.now.getTime();
  const since = now - cfg.windowDays * DAY_MS;

  // Chuẩn hoá: chỉ giữ sự kiện trong cửa sổ, mốc thời gian dạng số.
  const evs = input.events
    .map((e) => ({ ...e, t: e.at.getTime() }))
    .filter((e) => e.t >= since && e.t <= now + HOUR_MS); // lệch đồng hồ nhẹ vẫn nhận

  const overall = new Acc();
  const bySkill = new Map<Skill, Acc>(SKILLS.map((s) => [s, new Acc()]));
  const skillEvents = new Map<Skill, { correct: boolean; at: number }[]>(SKILLS.map((s) => [s, []]));
  const all: { correct: boolean; at: number }[] = [];
  const weakAcc = new Map<string, { acc: Acc; item: Omit<WeakItem, "acc" | "n" | "score"> }>();

  const bump = (key: string, item: Omit<WeakItem, "acc" | "n" | "score">, correct: boolean, t: number) => {
    let g = weakAcc.get(key);
    if (!g) weakAcc.set(key, (g = { acc: new Acc(), item }));
    g.acc.add(correct, t, now, cfg.halfLifeDays);
  };

  for (const e of evs) {
    overall.add(e.correct, e.t, now, cfg.halfLifeDays);
    all.push({ correct: e.correct, at: e.t });

    const skill = skillOf(e.game, e.part);
    if (skill) {
      bySkill.get(skill)!.add(e.correct, e.t, now, cfg.halfLifeDays);
      skillEvents.get(skill)!.push({ correct: e.correct, at: e.t });
    }

    if (e.part === "grammar" && e.grammarTopic && e.cefr) {
      bump(`grammar_topic:${e.cefr}:${e.grammarTopic}`, {
        kind: "grammar_topic", key: `grammar_topic:${e.cefr}:${e.grammarTopic}`, label: `Ngữ pháp: ${e.grammarTopic} (${e.cefr})`, cefr: e.cefr, topic: e.grammarTopic,
      }, e.correct, e.t);
    }
    if (e.part === "vocab" && e.cefr) {
      if (e.pos) {
        const key = `vocab_pos:${e.cefr}:${e.pos}`;
        bump(key, { kind: "vocab_pos", key, label: `Từ vựng ${e.cefr}: ${posLabel(e.pos)}`, cefr: e.cefr, pos: e.pos }, e.correct, e.t);
      }
      // "general" là lĩnh vực mặc định (gần như mọi từ): không cho biết gì về điểm yếu.
      if (e.domain && e.domain !== "general") {
        const key = `vocab_domain:${e.cefr}:${e.domain}`;
        bump(key, { kind: "vocab_domain", key, label: `Từ vựng ${e.cefr}: lĩnh vực ${e.domain}`, cefr: e.cefr, domain: e.domain }, e.correct, e.t);
      }
    }
  }

  // --- kỹ năng ---
  const skills: SkillStat[] = SKILLS.map((skill) => {
    const a = bySkill.get(skill)!;
    return {
      skill,
      acc: a.n >= 1 ? round4(a.acc ?? 0) : null,
      n: a.n,
      trend: trendOf(skillEvents.get(skill)!, now, cfg.trendMinN),
    };
  });

  // --- điểm yếu: n ≥ weakMinN và độ chính xác < ngưỡng; xếp theo (1 − acc) × log(1 + n) × độ mới ---
  const weak: WeakItem[] = [];
  for (const { acc, item } of weakAcc.values()) {
    const a = acc.acc;
    if (a === null || acc.n < cfg.weakMinN || a >= cfg.weakAccuracy) continue;
    const recency = decayWeight(now - acc.latest, cfg.halfLifeDays);
    weak.push({ ...item, acc: round4(a), n: acc.n, score: round4((1 - a) * Math.log(1 + acc.n) * recency) });
  }
  weak.sort((x, y) => y.score - x.score || x.key.localeCompare(y.key));
  weak.length = Math.min(weak.length, cfg.weakTop);

  // --- hành vi ---
  const hourCount = new Array<number>(24).fill(0);
  const dayAnswered = new Set<number>();
  let hints = 0;
  let lastAt = 0;
  for (const e of evs) {
    hourCount[vnHour(e.t)]++;
    dayAnswered.add(dayNo(e.t));
    if (e.hintUsed) hints++;
    if (e.t > lastAt) lastAt = e.t;
  }
  const usualHours = hourCount
    .map((c, h) => ({ c, h }))
    .filter((x) => x.c > 0)
    .sort((a, b) => b.c - a.c || a.h - b.h)
    .slice(0, cfg.topHours)
    .map((x) => x.h);
  const today = dayNo(now);
  const activeDays14 = [...dayAnswered].filter((d) => d > today - 14 && d <= today).length;

  const rounds = input.rounds.filter((r) => r.createdAt.getTime() >= since);
  const gameRounds = new Map<string, number>();
  for (const r of rounds) gameRounds.set(r.game, (gameRounds.get(r.game) ?? 0) + 1);
  const favoriteGames = [...gameRounds]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, cfg.topGames)
    .map(([game, n]) => ({ game, rounds: n }));
  const matured = rounds.filter((r) => now - r.createdAt.getTime() >= cfg.abandonAfterHours * HOUR_MS);
  const abandoned = matured.filter((r) => r.finishedAt === null).length;

  const sessionMins = input.sessions
    .filter((s) => s.events >= 2 && s.start.getTime() >= since)
    .map((s) => (s.end.getTime() - s.start.getTime()) / 60_000);
  const sessionMedian = median(sessionMins);

  const ratios: number[] = [];
  for (const e of evs) {
    const med = input.medians[e.game];
    if (e.responseMs !== null && med && med > 0) ratios.push(e.responseMs / med);
  }
  const speed = median(ratios);

  const behavior: InsightMetrics["behavior"] = {
    usualHours,
    sessions: input.sessions.filter((s) => s.start.getTime() >= since).length,
    sessionMedianMin: sessionMedian === null ? null : Math.round(sessionMedian * 10) / 10,
    favoriteGames,
    roundsStarted: rounds.length,
    abandonRate: matured.length > 0 ? round4(abandoned / matured.length) : null,
    speedRatio: speed === null || ratios.length < 5 ? null : round4(speed),
    hintRate: evs.length > 0 ? round4(hints / evs.length) : null,
    activeDays14,
    lastActiveDay: lastAt > 0 ? dayNo(lastAt) : null,
    overdueShare: input.review.due > 0 ? round4(input.review.overdue2d / input.review.due) : null,
  };

  // --- điểm các bài kiểm tra: bài gần nhất và bài ngay trước đó (mọi loại) ---
  const exams = [...input.exams].sort((a, b) => b.at.getTime() - a.at.getTime());
  const [last, prev] = [exams[0], exams[1]];
  const part = (p: ExamPart) => ({ last: last ? last[p] : null, prev: prev ? prev[p] : null });

  return {
    v: 1,
    asOf: input.now.toISOString(),
    windowDays: cfg.windowDays,
    samples: evs.length,
    overall: { acc: overall.n > 0 ? round4(overall.acc ?? 0) : null, n: overall.n, trend: trendOf(all, now, cfg.trendMinN) },
    skills,
    weak,
    behavior,
    exams: { count: exams.length, parts: { vocab: part("vocab"), grammar: part("grammar"), reading: part("reading"), listening: part("listening") }, lastTotal: last?.total ?? null, prevTotal: prev?.total ?? null },
  };
}

// ---------------------------------------------------------------------------
// Đọc lại hồ sơ đã lưu
// ---------------------------------------------------------------------------

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * Đọc `user_insights.data` (jsonb, ai cũng có thể đã ghi bản cũ) thành InsightMetrics, hoặc null nếu không dùng được
 * (chưa có, khác phiên bản, thiếu phần chính). null nghĩa là "tính lại", không phải lỗi.
 */
export function parseMetrics(raw: unknown): InsightMetrics | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  if (typeof raw.asOf !== "string" || Number.isNaN(Date.parse(raw.asOf))) return null;
  if (!isObj(raw.overall) || !Array.isArray(raw.skills) || !Array.isArray(raw.weak) || !isObj(raw.behavior) || !isObj(raw.exams)) return null;
  return raw as unknown as InsightMetrics;
}

// ---------------------------------------------------------------------------
// Weak-first: ưu tiên từ thuộc nhóm yếu khi chọn từ cho một vòng
// ---------------------------------------------------------------------------

export type WeakProfile = {
  /** Nhóm từ vựng yếu: cấp + (loại từ hoặc lĩnh vực) + điểm yếu. */
  vocab: { cefr: Cefr; pos?: string; domain?: string; score: number }[];
  /** Chủ đề ngữ pháp yếu theo cấp. */
  grammar: { cefr: Cefr; topic: string; score: number }[];
};

export const EMPTY_WEAK: WeakProfile = { vocab: [], grammar: [] };

/** Hồ sơ yếu dùng cho weak-first. null / hồ sơ cũ không đọc được → rỗng (không ưu tiên gì, vòng chơi như cũ). */
export function weakProfileOf(m: Pick<InsightMetrics, "weak"> | null | undefined): WeakProfile {
  if (!m || !Array.isArray(m.weak)) return EMPTY_WEAK;
  const vocab: WeakProfile["vocab"] = [];
  const grammar: WeakProfile["grammar"] = [];
  for (const w of m.weak) {
    if (!w.cefr) continue;
    if (w.kind === "vocab_pos" && w.pos) vocab.push({ cefr: w.cefr, pos: w.pos, score: w.score });
    else if (w.kind === "vocab_domain" && w.domain) vocab.push({ cefr: w.cefr, domain: w.domain, score: w.score });
    else if (w.kind === "grammar_topic" && w.topic) grammar.push({ cefr: w.cefr, topic: w.topic, score: w.score });
  }
  return { vocab, grammar };
}

/** Điểm yếu của một từ: lớn nhất trong các nhóm yếu mà nó thuộc về (cùng cấp, và cùng loại từ hoặc lĩnh vực). 0 = không thuộc nhóm nào. */
export function wordWeakness(w: { cefr: string; pos: string; domain: string }, p: WeakProfile): number {
  let best = 0;
  for (const g of p.vocab) {
    if (g.cefr !== w.cefr) continue;
    if ((g.pos !== undefined && g.pos === w.pos) || (g.domain !== undefined && g.domain === w.domain)) best = Math.max(best, g.score);
  }
  return best;
}

/**
 * Sắp lại danh sách ứng viên cho một vòng `n` câu: từ thuộc nhóm yếu (yếu nhất trước) chiếm tối đa `weakShare`·n chỗ đầu,
 * phần còn lại giữ nguyên thứ tự gốc (đã xáo hoặc đã sắp theo hạn ôn). Từ yếu dư ra được xếp sau cùng.
 * Không bỏ từ nào, không thêm từ nào: chỉ đổi thứ tự, nên người gọi cắt `slice(0, n)` như cũ.
 */
export function preferWeak<T extends { cefr: string; pos: string; domain: string }>(words: readonly T[], p: WeakProfile, n: number, share = INSIGHT_CFG.weakShare): T[] {
  if (p.vocab.length === 0 || words.length === 0) return [...words];
  const scored = words.map((w, i) => ({ w, i, s: wordWeakness(w, p) }));
  const weak = scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i);
  if (weak.length === 0) return [...words];
  const quota = Math.min(weak.length, Math.max(1, Math.ceil(n * share)));
  const head = weak.slice(0, quota);
  const used = new Set(head.map((x) => x.i));
  const rest = scored.filter((x) => !used.has(x.i)); // giữ thứ tự gốc, từ yếu dư nằm lẫn trong đó
  return [...head, ...rest].map((x) => x.w);
}

/** Chủ đề ngữ pháp yếu của một cấp, yếu nhất trước (dùng chọn câu ngữ pháp cho tf / build). */
export function weakGrammarTopics(p: WeakProfile, cefr: Cefr, max = 3): string[] {
  return p.grammar
    .filter((g) => g.cefr === cefr)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((g) => g.topic);
}

// ---------------------------------------------------------------------------
// Bộ gợi ý theo luật
// ---------------------------------------------------------------------------

export type ReasonCode =
  | "due_backlog"
  | "weak_grammar_topic"
  | "weak_skill"
  | "exam_gap"
  | "ready_for_exam"
  | "streak_risk"
  | "long_absence";

export type ActionKind = "review" | "play" | "learn" | "exam" | "test";

export type NextAction = {
  reason: ReasonCode;
  action: ActionKind;
  /** Cấp để thực hiện hành động. */
  cefr: Cefr;
  game?: GameId;
  /** Kỹ năng nhắm tới (weak_skill) và chủ đề ngữ pháp yếu (weak_grammar_topic). */
  skill?: Skill;
  topic?: string;
  /** Số liệu để chèn vào câu lý do. Chính người học cũng thấy các số này ở /insights. */
  evidence: Record<string, number | string>;
};

/** Tín hiệu theo thời gian thực; lấy từ trang chủ (getHome) nên không tốn truy vấn thêm. */
export type LiveSignals = {
  now: Date;
  /** Số từ đang đến hạn ôn. */
  dueCount: number;
  /** Chuỗi ngày hiển thị (đã về 0 nếu bỏ lỡ hơn một ngày) và ngày cuối có học (dayNo), null nếu chưa từng. */
  streak: number;
  lastDay: number | null;
  /** Cấp đang học (mở, chưa qua) và trạng thái thi của nó. */
  level: { cefr: Cefr; eligible: boolean; missingWords: number };
};

/**
 * Chọn tối đa `maxActions` hành động, mỗi hành động có mã lý do (mục 6.4). Thứ tự ưu tiên cố định; trong cùng một mã
 * thì theo độ yếu. Hàm thuần và tất định: cùng đầu vào, cùng đầu ra.
 *
 *  - Vắng lâu: chỉ đề nghị một vòng ôn nhẹ (không dội cả đống từ tồn đọng, không đề nghị thi) để tránh quá tải.
 *  - weak_skill không lặp lại ngữ pháp khi đã có weak_grammar_topic (hai gợi ý cùng một việc).
 */
export function buildNextActions(m: InsightMetrics | null, live: LiveSignals, cfgOver: Partial<InsightCfg> = {}): NextAction[] {
  const cfg: InsightCfg = { ...INSIGHT_CFG, ...cfgOver };
  const today = dayNo(live.now);
  const cefr = live.level.cefr;
  const daysSince = live.lastDay === null ? null : today - live.lastDay;
  const candidates: { prio: number; a: NextAction }[] = [];

  // long_absence: đã từng học, vắng từ longAbsenceDays ngày
  if (daysSince !== null && daysSince >= cfg.longAbsenceDays) {
    return [{ reason: "long_absence", action: "play", cefr, game: "quiz", evidence: { days: daysSince } }];
  }

  // streak_risk: có chuỗi đủ dài, hôm qua có học, hôm nay chưa
  if (live.streak >= cfg.streakRiskMin && live.lastDay === today - 1) {
    candidates.push({ prio: 90, a: { reason: "streak_risk", action: "play", cefr, game: "quiz", evidence: { streak: live.streak } } });
  }

  // due_backlog
  if (live.dueCount >= cfg.dueBacklogMin) {
    candidates.push({ prio: 80, a: { reason: "due_backlog", action: "review", cefr, evidence: { due: live.dueCount } } });
  }

  // ready_for_exam: đủ điều kiện thi VÀ độ chính xác gần đây ổn định
  const acc = m?.overall?.acc ?? null;
  const accN = m?.overall?.n ?? 0;
  if (live.level.eligible && acc !== null && accN >= cfg.readyMinN && acc >= cfg.readyMinAccuracy) {
    candidates.push({ prio: 75, a: { reason: "ready_for_exam", action: "exam", cefr, evidence: { acc: Math.round(acc * 100), n: accN } } });
  }

  // weak_grammar_topic: chủ đề ngữ pháp yếu nhất của cấp đang học (không có thì chủ đề yếu nhất bất kỳ)
  const topics = (Array.isArray(m?.weak) ? m!.weak : []).filter((w) => w.kind === "grammar_topic" && w.topic);
  const topic = topics.find((w) => w.cefr === cefr) ?? topics[0];
  if (topic?.topic) {
    candidates.push({
      prio: 60 + Math.min(topic.score, 4),
      a: { reason: "weak_grammar_topic", action: "play", cefr, game: "tf", topic: topic.topic, evidence: { topic: topic.topic, acc: Math.round(topic.acc * 100), n: topic.n } },
    });
  }

  // weak_skill: kỹ năng thấp rõ rệt so với trung bình các kỹ năng còn lại
  const measured = (Array.isArray(m?.skills) ? m!.skills : []).filter((s) => s.acc !== null && s.n >= cfg.skillMinN);
  if (measured.length >= 2) {
    const ranked = measured
      .map((s) => {
        const others = measured.filter((o) => o.skill !== s.skill);
        const avg = others.reduce((t, o) => t + (o.acc ?? 0), 0) / others.length;
        return { s, gap: avg - (s.acc ?? 0), avg };
      })
      .filter((x) => x.gap >= cfg.skillGap)
      .sort((a, b) => b.gap - a.gap || a.s.skill.localeCompare(b.s.skill));
    for (const { s, gap, avg } of ranked) {
      if (s.skill === "grammar" && topic) continue; // đã có weak_grammar_topic
      candidates.push({
        prio: 55 + Math.min(gap * 10, 4),
        a: {
          reason: "weak_skill",
          action: SKILL_GAME[s.skill] ? "play" : "test", // đọc hiểu: chưa có trò riêng → làm bài kiểm tra (có bài đọc)
          cefr,
          game: SKILL_GAME[s.skill] ?? undefined,
          skill: s.skill,
          evidence: { skill: SKILL_LABEL[s.skill], acc: Math.round((s.acc ?? 0) * 100), others: Math.round(avg * 100), n: s.n },
        },
      });
      break; // một gợi ý kỹ năng là đủ
    }
  }

  // exam_gap: còn thiếu từ để đủ điều kiện thi
  if (!live.level.eligible && live.level.missingWords > 0) {
    candidates.push({ prio: 50, a: { reason: "exam_gap", action: "learn", cefr, evidence: { missing: live.level.missingWords } } });
  }

  candidates.sort((x, y) => y.prio - x.prio);
  return candidates.slice(0, cfg.maxActions).map((c) => c.a);
}

// ---------------------------------------------------------------------------
// Câu chữ dự phòng (template) — chính là câu AI sẽ diễn đạt lại ở giai đoạn 3
// ---------------------------------------------------------------------------

export type ActionText = { title: string; why: string };

/** Tiêu đề + lý do bằng tiếng Việt, số liệu lấy từ `evidence`. Không bịa số nào ngoài evidence. */
export function describeAction(a: NextAction): ActionText {
  const e = a.evidence;
  switch (a.reason) {
    case "due_backlog":
      return { title: "Ôn các từ đến hạn", why: `Bạn có ${e.due} từ đến hạn ôn. Ôn sớm giúp từ không bị quên.` };
    case "weak_grammar_topic":
      return { title: `Luyện ngữ pháp: ${e.topic}`, why: `Chủ đề này bạn đúng ${e.acc}% trong ${e.n} câu gần đây, thấp hơn mức ổn định.` };
    case "weak_skill":
      return { title: `Luyện kỹ năng ${String(e.skill).toLowerCase()}`, why: `Kỹ năng này bạn đúng ${e.acc}%, các kỹ năng khác trung bình ${e.others}% (${e.n} câu).` };
    case "exam_gap":
      return { title: `Học thêm từ ở cấp ${a.cefr}`, why: `Còn thiếu ${e.missing} từ nữa là đủ điều kiện thi lên cấp.` };
    case "ready_for_exam":
      return { title: `Thi lên cấp ${a.cefr}`, why: `Bạn đủ điều kiện thi và gần đây đúng ${e.acc}% (${e.n} câu).` };
    case "streak_risk":
      return { title: "Giữ chuỗi ngày", why: `Chuỗi ${e.streak} ngày sẽ đứt nếu hôm nay bạn chưa học. Một vòng ngắn là đủ.` };
    case "long_absence":
      return { title: "Quay lại nhẹ nhàng", why: `Bạn vắng ${e.days} ngày rồi. Bắt đầu bằng một vòng ôn nhẹ thôi, đừng vội.` };
  }
}

/** Liên kết trong app cho một hành động. Chỉ trả đường dẫn nội bộ, ghép từ giá trị đã kiểm (cấp, game, slug). */
export function actionHref(a: NextAction): string {
  switch (a.action) {
    case "review":
      return `/level/${a.cefr}`;
    case "learn":
      return `/learn/${a.cefr}`;
    case "exam":
      return `/exam/${a.cefr}`;
    case "test":
      return "/test";
    case "play":
      return `/play/${a.game ?? "quiz"}?cefr=${a.cefr}`;
  }
}
