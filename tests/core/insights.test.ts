import { describe, expect, it } from "vitest";
import {
  actionHref,
  buildNextActions,
  computeInsights,
  decayWeight,
  describeAction,
  median,
  preferWeak,
  vnHour,
  weakGrammarTopics,
  weakProfileOf,
  wordWeakness,
  type ExamPoint,
  type InsightEvent,
  type InsightInput,
  type InsightMetrics,
  type LiveSignals,
  parseMetrics,
} from "../../src/core/insights";
import { SKILLS, skillOf } from "../../src/core/skills";
import { dayNo } from "../../src/core/streak";
import type { Cefr } from "../../src/core/types";

const NOW = new Date("2026-10-28T05:00:00Z"); // 12:00 giờ VN
const DAY = 86_400_000;
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * DAY - hours * 3_600_000);

const ev = (o: Partial<InsightEvent> & { daysAgo?: number }): InsightEvent => {
  const { daysAgo = 0, ...rest } = o;
  return { game: "quiz", part: "vocab", correct: true, hintUsed: false, responseMs: null, at: ago(daysAgo, 0), cefr: "A1", pos: "n", domain: "general", grammarTopic: null, ...rest };
};
/** n câu cùng thuộc tính: `wrong` câu đầu tiên sai. */
const many = (n: number, wrong: number, o: Partial<InsightEvent> & { daysAgo?: number } = {}): InsightEvent[] =>
  Array.from({ length: n }, (_, i) => ev({ ...o, correct: i >= wrong }));

const input = (events: InsightEvent[], over: Partial<InsightInput> = {}): InsightInput => ({
  now: NOW, events, rounds: [], sessions: [], exams: [], medians: {}, review: { due: 0, overdue2d: 0 }, ...over,
});

describe("skillOf", () => {
  it("ánh xạ game sang kỹ năng (mục 6.1)", () => {
    expect(skillOf("quiz", "vocab")).toBe("meaning");
    expect(skillOf("blitz", "vocab")).toBe("meaning");
    expect(skillOf("match", "vocab")).toBe("meaning");
    expect(skillOf("flash", "vocab")).toBe("meaning");
    expect(skillOf("type", "vocab")).toBe("recall");
    expect(skillOf("scramble", "vocab")).toBe("recall");
    expect(skillOf("cloze", "vocab")).toBe("context");
    expect(skillOf("listen", "vocab")).toBe("listening");
    expect(skillOf("tf", "grammar")).toBe("grammar");
    expect(skillOf("build", "grammar")).toBe("grammar");
    expect(skillOf("grammar", "grammar")).toBe("grammar");
  });
  it("câu bài đọc/nghe theo part; game lạ không đoán", () => {
    expect(skillOf("passage", "reading")).toBe("reading");
    expect(skillOf("passage", "listening")).toBe("listening");
    expect(skillOf("passage", "vocab")).toBeNull();
    expect(skillOf("lạ", "vocab")).toBeNull();
    expect(skillOf("lạ", "grammar")).toBe("grammar");
  });
});

describe("tiện ích", () => {
  it("decayWeight: 1 lúc vừa xong, 0.5 sau một chu kỳ bán rã, không tăng khi giờ lệch", () => {
    expect(decayWeight(0, 14)).toBe(1);
    expect(decayWeight(14 * DAY, 14)).toBeCloseTo(0.5, 10);
    expect(decayWeight(28 * DAY, 14)).toBeCloseTo(0.25, 10);
    expect(decayWeight(-5 * DAY, 14)).toBe(1);
  });
  it("median và giờ Việt Nam", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(vnHour(NOW.getTime())).toBe(12);
    expect(vnHour(new Date("2026-10-28T20:30:00Z").getTime())).toBe(3);
  });
});

describe("computeInsights: độ chính xác và kỹ năng", () => {
  it("không có sự kiện: mọi thứ rỗng, không NaN", () => {
    const m = computeInsights(input([]));
    expect(m.samples).toBe(0);
    expect(m.overall).toEqual({ acc: null, n: 0, trend: null });
    expect(m.skills.map((s) => s.skill)).toEqual([...SKILLS]);
    expect(m.skills.every((s) => s.acc === null && s.n === 0 && s.trend === null)).toBe(true);
    expect(m.weak).toEqual([]);
    expect(m.behavior.usualHours).toEqual([]);
    expect(m.behavior.abandonRate).toBeNull();
    expect(m.behavior.speedRatio).toBeNull();
    expect(m.behavior.lastActiveDay).toBeNull();
    expect(m.exams.count).toBe(0);
    expect(JSON.parse(JSON.stringify(m))).toEqual(m); // lưu được vào jsonb
  });

  it("độ chính xác theo kỹ năng, kèm số mẫu", () => {
    const m = computeInsights(input([...many(10, 2, { game: "quiz" }), ...many(10, 5, { game: "type" }), ...many(6, 0, { game: "cloze" })]));
    const by = Object.fromEntries(m.skills.map((s) => [s.skill, s]));
    expect(by.meaning.n).toBe(10);
    expect(by.meaning.acc).toBeCloseTo(0.8, 3);
    expect(by.recall.acc).toBeCloseTo(0.5, 3);
    expect(by.context.acc).toBe(1);
    expect(by.listening.acc).toBeNull();
    expect(m.overall.n).toBe(26);
  });

  it("trọng số giảm dần: câu gần đây nặng hơn câu cũ", () => {
    // 10 câu sai cách 40 ngày, 10 câu đúng hôm nay → gần 100%, hơn hẳn trung bình thô 50%
    const m = computeInsights(input([...many(10, 10, { daysAgo: 40 }), ...many(10, 0, { daysAgo: 0 })]));
    expect(m.overall.acc!).toBeGreaterThan(0.85);
  });

  it("bỏ sự kiện ngoài cửa sổ phân tích", () => {
    const m = computeInsights(input([...many(10, 10, { daysAgo: 61 }), ...many(4, 0, { daysAgo: 1 })]));
    expect(m.samples).toBe(4);
    expect(m.overall.acc).toBe(1);
  });

  it("xu hướng: 7 ngày gần nhất so với 7 ngày trước; null khi một nửa thiếu mẫu", () => {
    const up = computeInsights(input([...many(10, 8, { daysAgo: 10 }), ...many(10, 2, { daysAgo: 2 })]));
    expect(up.overall.trend).toBeCloseTo(0.6, 3); // 0.8 − 0.2
    const only = computeInsights(input(many(10, 2, { daysAgo: 2 })));
    expect(only.overall.trend).toBeNull();
    const thin = computeInsights(input([...many(2, 0, { daysAgo: 10 }), ...many(10, 0, { daysAgo: 2 })]));
    expect(thin.overall.trend).toBeNull(); // nửa trước chỉ 2 câu < 3
  });
});

describe("computeInsights: điểm yếu", () => {
  it("cần n ≥ 5 và độ chính xác < 0,7", () => {
    const m = computeInsights(input([
      ...many(4, 4, { pos: "v" }), // sai hết nhưng chỉ 4 câu → chưa đủ mẫu
      ...many(10, 2, { pos: "n" }), // 80% → không yếu
      ...many(10, 5, { pos: "adj" }), // 50% → yếu
    ]));
    const keys = m.weak.map((w) => w.key);
    expect(keys).toContain("vocab_pos:A1:adj");
    expect(keys).not.toContain("vocab_pos:A1:v");
    expect(keys).not.toContain("vocab_pos:A1:n");
    const adj = m.weak.find((w) => w.key === "vocab_pos:A1:adj")!;
    expect(adj.n).toBe(10);
    expect(adj.acc).toBeCloseTo(0.5, 3);
    expect(adj.label).toContain("tính từ");
  });

  it("xếp theo (1 − acc) × log(1 + n) × độ mới", () => {
    const m = computeInsights(input([
      ...many(20, 10, { pos: "adj" }), // acc 0,5, n 20
      ...many(6, 3, { pos: "adv" }), // acc 0,5, n 6 → điểm thấp hơn vì ít mẫu
      ...many(20, 10, { pos: "prep", daysAgo: 50 }), // cũ → điểm thấp vì độ mới
    ]));
    expect(m.weak.map((w) => w.kind === "vocab_pos" && w.pos)).toEqual(["adj", "adv", "prep"]);
    expect(m.weak[0].score).toBeGreaterThan(m.weak[1].score);
    expect(m.weak[1].score).toBeGreaterThan(m.weak[2].score);
  });

  it("nhóm ngữ pháp theo (cấp, chủ đề); lĩnh vực general không phải nhóm yếu", () => {
    const m = computeInsights(input([
      ...many(8, 6, { game: "tf", part: "grammar", cefr: "B1", grammarTopic: "tenses", pos: null, domain: null }),
      ...many(8, 6, { game: "quiz", domain: "general" }),
      ...many(8, 6, { game: "quiz", domain: "travel", pos: "n" }),
    ]));
    const keys = m.weak.map((w) => w.key);
    expect(keys).toContain("grammar_topic:B1:tenses");
    expect(keys).toContain("vocab_domain:A1:travel");
    expect(keys.some((k) => k.endsWith(":general"))).toBe(false);
  });

  it("giữ tối đa weakTop điểm yếu", () => {
    const posList = ["n", "v", "adj", "adv", "prep", "conj", "pron"];
    const m = computeInsights(input(posList.flatMap((p) => many(8, 6, { pos: p }))));
    expect(m.weak).toHaveLength(5);
  });

  it("tất định: đảo thứ tự sự kiện không đổi kết quả", () => {
    const evs = [...many(10, 5, { pos: "adj" }), ...many(10, 6, { pos: "adv" }), ...many(10, 1, { game: "type" })];
    const a = computeInsights(input(evs));
    const b = computeInsights(input([...evs].reverse()));
    expect(b).toEqual(a);
  });
});

describe("computeInsights: hành vi", () => {
  it("giờ học hay gặp theo giờ VN, nhiều nhất trước", () => {
    const at = (h: number) => new Date(`2026-10-27T${String(h).padStart(2, "0")}:00:00Z`); // + 7 giờ
    const m = computeInsights(input([
      ...Array.from({ length: 5 }, () => ev({ at: at(13) })), // 20h VN
      ...Array.from({ length: 2 }, () => ev({ at: at(2) })), // 9h VN
      ev({ at: at(20) }), // 3h VN
    ]));
    expect(m.behavior.usualHours).toEqual([20, 9, 3]);
  });

  it("số ngày có học trong 14 ngày và ngày cuối", () => {
    const m = computeInsights(input([ev({ daysAgo: 0 }), ev({ daysAgo: 0 }), ev({ daysAgo: 3 }), ev({ daysAgo: 20 })]));
    expect(m.behavior.activeDays14).toBe(2);
    expect(m.behavior.lastActiveDay).toBe(dayNo(NOW));
  });

  it("trò hay chơi và tỉ lệ bỏ dở: vòng vừa mở (dưới 1 giờ) chưa tính", () => {
    const r = (game: string, daysAgo: number, done: boolean, minsAgo = 0) => ({
      game, createdAt: new Date(ago(daysAgo).getTime() - minsAgo * 60_000), finishedAt: done ? ago(daysAgo) : null,
    });
    const m = computeInsights(input([], { rounds: [r("quiz", 2, true), r("quiz", 3, false), r("type", 4, true), r("quiz", 5, true), r("flash", 0, false, 10)] }));
    expect(m.behavior.roundsStarted).toBe(5);
    expect(m.behavior.favoriteGames[0]).toEqual({ game: "quiz", rounds: 3 });
    expect(m.behavior.abandonRate).toBeCloseTo(0.25, 3); // 1 bỏ dở trong 4 vòng đủ tuổi; vòng flash 10 phút trước không tính
  });

  it("phiên: trung vị độ dài, bỏ phiên chỉ một sự kiện", () => {
    const s = (startMin: number, endMin: number, events: number) => ({ start: new Date(ago(1).getTime() + startMin * 60_000), end: new Date(ago(1).getTime() + endMin * 60_000), events });
    const m = computeInsights(input([], { sessions: [s(0, 10, 3), s(100, 130, 4), s(200, 200, 1), s(300, 320, 2)] }));
    expect(m.behavior.sessions).toBe(4);
    expect(m.behavior.sessionMedianMin).toBe(20);
  });

  it("tốc độ so với trung vị chung cùng game; cần ≥ 5 số đo", () => {
    const slow = Array.from({ length: 6 }, () => ev({ game: "quiz", responseMs: 6000 }));
    const m = computeInsights(input(slow, { medians: { quiz: 3000 } }));
    expect(m.behavior.speedRatio).toBe(2);
    const few = computeInsights(input(slow.slice(0, 4), { medians: { quiz: 3000 } }));
    expect(few.behavior.speedRatio).toBeNull();
    const noMedian = computeInsights(input(slow, { medians: {} }));
    expect(noMedian.behavior.speedRatio).toBeNull();
  });

  it("mức dùng gợi ý và tỉ lệ quá hạn", () => {
    const m = computeInsights(input([ev({ hintUsed: true }), ev({}), ev({}), ev({})], { review: { due: 20, overdue2d: 5 } }));
    expect(m.behavior.hintRate).toBe(0.25);
    expect(m.behavior.overdueShare).toBe(0.25);
    expect(computeInsights(input([])).behavior.overdueShare).toBeNull();
  });
});

describe("computeInsights: điểm các bài kiểm tra", () => {
  const pt = (daysAgo: number, total: number, vocab: number, reading: number | null = null): ExamPoint => ({
    at: ago(daysAgo), kind: "practice", cefr: null, total, vocab, grammar: vocab, reading, listening: null, passed: null,
  });
  it("lấy bài gần nhất và bài ngay trước, bất kể thứ tự đầu vào", () => {
    const m = computeInsights(input([], { exams: [pt(9, 0.5, 0.4), pt(1, 0.8, 0.9, 0.7), pt(5, 0.6, 0.5)] }));
    expect(m.exams.count).toBe(3);
    expect(m.exams.lastTotal).toBe(0.8);
    expect(m.exams.prevTotal).toBe(0.6);
    expect(m.exams.parts.vocab).toEqual({ last: 0.9, prev: 0.5 });
    expect(m.exams.parts.reading).toEqual({ last: 0.7, prev: null });
    expect(m.exams.parts.listening).toEqual({ last: null, prev: null });
  });
});

// ---------------------------------------------------------------------------

describe("weak-first", () => {
  const metrics = (): InsightMetrics =>
    computeInsights(input([
      ...many(20, 12, { pos: "adj" }), // yếu nhất
      ...many(10, 5, { pos: "adv" }),
      ...many(10, 5, { game: "quiz", domain: "travel", pos: "n" }),
      ...many(8, 6, { game: "tf", part: "grammar", cefr: "B1", grammarTopic: "tenses", pos: null, domain: null }),
    ]));
  const w = (id: number, pos: string, cefr = "A1", domain = "general") => ({ id, cefr, pos, domain });

  it("weakProfileOf: rỗng khi chưa có hồ sơ hoặc hồ sơ hỏng", () => {
    expect(weakProfileOf(null)).toEqual({ vocab: [], grammar: [] });
    expect(weakProfileOf(undefined)).toEqual({ vocab: [], grammar: [] });
    expect(weakProfileOf({ weak: undefined as never })).toEqual({ vocab: [], grammar: [] });
  });

  it("weakProfileOf tách nhóm từ vựng và ngữ pháp", () => {
    const p = weakProfileOf(metrics());
    expect(p.vocab.some((g) => g.pos === "adj" && g.cefr === "A1")).toBe(true);
    expect(p.grammar.map((g) => g.topic)).toEqual(["tenses"]);
    expect(weakGrammarTopics(p, "B1")).toEqual(["tenses"]);
    expect(weakGrammarTopics(p, "A1")).toEqual([]);
  });

  it("wordWeakness: cùng cấp và cùng loại từ / lĩnh vực mới tính", () => {
    const p = weakProfileOf(metrics());
    expect(wordWeakness(w(1, "adj"), p)).toBeGreaterThan(0);
    expect(wordWeakness(w(2, "adj", "B1"), p)).toBe(0); // khác cấp
    expect(wordWeakness(w(3, "v"), p)).toBe(0);
    expect(wordWeakness(w(4, "v", "A1", "travel"), p)).toBeGreaterThan(0); // trúng nhóm lĩnh vực yếu
  });

  it("preferWeak: từ yếu lên đầu, chiếm tối đa 60% chỗ, giữ nguyên thứ tự còn lại, không mất từ nào", () => {
    const p = weakProfileOf(metrics());
    const words = [w(1, "v"), w(2, "adj"), w(3, "v"), w(4, "adj"), w(5, "adj"), w(6, "v"), w(7, "adj"), w(8, "adj"), w(9, "v"), w(10, "v")];
    const out = preferWeak(words, p, 5);
    expect(out).toHaveLength(words.length);
    expect(new Set(out.map((x) => x.id))).toEqual(new Set(words.map((x) => x.id)));
    // 5 chỗ đầu của vòng: ceil(5 × 0,6) = 3 từ yếu + 2 từ theo thứ tự gốc (ở đây là từ 1 và 3)
    const first5 = out.slice(0, 5);
    expect(first5.filter((x) => x.pos === "adj")).toHaveLength(3);
    expect(first5.slice(3).map((x) => x.id)).toEqual([1, 3]);
  });

  it("preferWeak: hồ sơ rỗng hoặc không từ nào yếu thì giữ nguyên thứ tự", () => {
    const words = [w(1, "v"), w(2, "v"), w(3, "v")];
    expect(preferWeak(words, weakProfileOf(null), 3).map((x) => x.id)).toEqual([1, 2, 3]);
    expect(preferWeak(words, weakProfileOf(metrics()), 3).map((x) => x.id)).toEqual([1, 2, 3]);
    expect(preferWeak([], weakProfileOf(metrics()), 3)).toEqual([]);
  });

  it("preferWeak: ít từ yếu hơn hạn mức thì chỉ đưa số đó lên đầu", () => {
    const p = weakProfileOf(metrics());
    const out = preferWeak([w(1, "v"), w(2, "v"), w(3, "adj"), w(4, "v")], p, 4);
    expect(out.map((x) => x.id)).toEqual([3, 1, 2, 4]);
  });

  it("preferWeak: nhóm yếu hơn đứng trước", () => {
    const p = weakProfileOf(metrics()); // adj yếu hơn adv
    const out = preferWeak([w(1, "adv"), w(2, "adj")], p, 4);
    expect(out.map((x) => x.id)).toEqual([2, 1]);
  });
});

// ---------------------------------------------------------------------------

describe("buildNextActions", () => {
  const TODAY = dayNo(NOW);
  const live = (over: Partial<LiveSignals> = {}): LiveSignals => ({
    now: NOW, dueCount: 0, streak: 0, lastDay: TODAY, level: { cefr: "A1" as Cefr, eligible: false, missingWords: 0 }, ...over,
  });
  const reasons = (m: InsightMetrics | null, l: LiveSignals) => buildNextActions(m, l).map((a) => a.reason);

  it("người mới (không dữ liệu, đủ điều kiện gì cũng chưa): không gợi ý bừa", () => {
    expect(buildNextActions(null, live())).toEqual([]);
    expect(buildNextActions(computeInsights(input([])), live())).toEqual([]);
  });

  it("due_backlog: từ ngưỡng 15 trở lên", () => {
    expect(reasons(null, live({ dueCount: 14 }))).toEqual([]);
    const a = buildNextActions(null, live({ dueCount: 15 }));
    expect(a).toEqual([{ reason: "due_backlog", action: "review", cefr: "A1", evidence: { due: 15 } }]);
  });

  it("streak_risk: chuỗi đủ dài, hôm qua có học, hôm nay chưa", () => {
    expect(reasons(null, live({ streak: 5, lastDay: TODAY - 1 }))).toEqual(["streak_risk"]);
    expect(reasons(null, live({ streak: 5, lastDay: TODAY }))).toEqual([]); // hôm nay đã học
    expect(reasons(null, live({ streak: 1, lastDay: TODAY - 1 }))).toEqual([]); // chuỗi quá ngắn
    expect(reasons(null, live({ streak: 0, lastDay: TODAY - 2 }))).toEqual([]); // chuỗi đã đứt
  });

  it("long_absence: vắng ≥ 5 ngày; chỉ gợi ý vòng nhẹ, bỏ mọi gợi ý nặng", () => {
    const m = computeInsights(input([...many(20, 14, { game: "tf", part: "grammar", cefr: "A1", grammarTopic: "tenses", pos: null, domain: null })]));
    const a = buildNextActions(m, live({ dueCount: 80, lastDay: TODAY - 6, level: { cefr: "A1", eligible: true, missingWords: 0 } }));
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ reason: "long_absence", action: "play", game: "quiz", evidence: { days: 6 } });
    expect(reasons(null, live({ lastDay: TODAY - 4 }))).toEqual([]); // 4 ngày chưa phải vắng lâu
    expect(reasons(null, live({ lastDay: null }))).toEqual([]); // chưa từng học: không phải "quay lại"
  });

  it("ready_for_exam: cần đủ điều kiện thi VÀ độ chính xác gần đây ổn định", () => {
    const good = computeInsights(input(many(30, 3)));
    const lowAcc = computeInsights(input(many(30, 15)));
    const few = computeInsights(input(many(10, 0)));
    const eligible = { cefr: "A2" as Cefr, eligible: true, missingWords: 0 };
    expect(buildNextActions(good, live({ level: eligible }))[0]).toMatchObject({ reason: "ready_for_exam", action: "exam", cefr: "A2", evidence: { acc: 90, n: 30 } });
    expect(reasons(lowAcc, live({ level: eligible }))).not.toContain("ready_for_exam");
    expect(reasons(few, live({ level: eligible }))).not.toContain("ready_for_exam"); // mới 10 câu
    expect(reasons(good, live())).not.toContain("ready_for_exam"); // chưa đủ điều kiện
  });

  it("exam_gap: còn thiếu từ để thi", () => {
    const a = buildNextActions(null, live({ level: { cefr: "B1", eligible: false, missingWords: 120 } }));
    expect(a).toEqual([{ reason: "exam_gap", action: "learn", cefr: "B1", evidence: { missing: 120 } }]);
    expect(reasons(null, live({ level: { cefr: "B1", eligible: true, missingWords: 0 } }))).toEqual([]);
  });

  it("weak_grammar_topic: ưu tiên chủ đề của cấp đang học, dẫn tới trò tf", () => {
    const m = computeInsights(input([
      ...many(10, 8, { game: "tf", part: "grammar", cefr: "A1", grammarTopic: "articles", pos: null, domain: null }),
      ...many(30, 20, { game: "tf", part: "grammar", cefr: "B1", grammarTopic: "tenses", pos: null, domain: null }),
    ]));
    const a = buildNextActions(m, live())[0];
    expect(a).toMatchObject({ reason: "weak_grammar_topic", action: "play", game: "tf", topic: "articles", cefr: "A1" });
    expect(a.evidence).toEqual({ topic: "articles", acc: 20, n: 10 });
  });

  it("weak_skill: kỹ năng thấp hơn trung bình các kỹ năng khác ≥ 15 điểm", () => {
    const m = computeInsights(input([...many(20, 1, { game: "quiz" }), ...many(20, 12, { game: "type" }), ...many(20, 2, { game: "cloze" })]));
    const a = buildNextActions(m, live());
    const skill = a.find((x) => x.reason === "weak_skill")!;
    expect(skill).toMatchObject({ action: "play", game: "type", skill: "recall" });
    expect(skill.evidence).toMatchObject({ acc: 40, n: 20 });
  });

  it("weak_skill: không báo khi chênh lệch nhỏ hoặc thiếu mẫu; cần ≥ 2 kỹ năng để so", () => {
    const close = computeInsights(input([...many(20, 4, { game: "quiz" }), ...many(20, 6, { game: "type" })]));
    expect(reasons(close, live())).not.toContain("weak_skill");
    const thin = computeInsights(input([...many(20, 0, { game: "quiz" }), ...many(5, 5, { game: "type" })])); // type mới 5 < 8 câu
    expect(reasons(thin, live())).not.toContain("weak_skill");
    const single = computeInsights(input(many(20, 18, { game: "quiz" })));
    expect(reasons(single, live())).not.toContain("weak_skill");
  });

  it("weak_skill đọc hiểu: chưa có trò riêng → trang Kiểm tra", () => {
    const m = computeInsights(input([...many(20, 0, { game: "quiz" }), ...many(10, 8, { game: "passage", part: "reading" })]));
    const a = buildNextActions(m, live()).find((x) => x.reason === "weak_skill")!;
    expect(a).toMatchObject({ action: "test", skill: "reading" });
    expect(a.game).toBeUndefined();
    expect(actionHref(a)).toBe("/test");
  });

  it("weak_skill không lặp lại ngữ pháp khi đã có weak_grammar_topic", () => {
    const m = computeInsights(input([
      ...many(20, 0, { game: "quiz" }),
      ...many(20, 14, { game: "tf", part: "grammar", cefr: "A1", grammarTopic: "tenses", pos: null, domain: null }),
    ]));
    const rs = reasons(m, live());
    expect(rs).toContain("weak_grammar_topic");
    expect(rs).not.toContain("weak_skill");
  });

  it("thứ tự ưu tiên và tối đa 3 hành động", () => {
    const m = computeInsights(input([
      ...many(30, 1, { game: "quiz" }),
      ...many(20, 14, { game: "type" }),
      ...many(20, 14, { game: "tf", part: "grammar", cefr: "A1", grammarTopic: "tenses", pos: null, domain: null }),
    ]));
    const a = buildNextActions(m, live({ streak: 4, lastDay: TODAY - 1, dueCount: 40, level: { cefr: "A1", eligible: true, missingWords: 0 } }));
    // độ chính xác chung ~59% < 75% nên chưa "sẵn sàng thi"; còn ngữ pháp (60+) đứng trên kỹ năng (55+)
    expect(a.map((x) => x.reason)).toEqual(["streak_risk", "due_backlog", "weak_grammar_topic"]);
  });

  it("tất định", () => {
    const m = computeInsights(input([...many(30, 1, { game: "quiz" }), ...many(20, 14, { game: "type" })]));
    const l = live({ dueCount: 20 });
    expect(buildNextActions(m, l)).toEqual(buildNextActions(m, l));
  });

  it("hồ sơ lưu từ phiên bản/dữ liệu khuyết vẫn không làm hỏng", () => {
    expect(() => buildNextActions({ v: 1 } as unknown as InsightMetrics, live({ dueCount: 20 }))).not.toThrow();
    expect(reasons({ v: 1 } as unknown as InsightMetrics, live({ dueCount: 20 }))).toEqual(["due_backlog"]);
  });
});

describe("parseMetrics", () => {
  it("nhận hồ sơ do computeInsights tạo ra, kể cả sau khi đi qua JSON", () => {
    const m = computeInsights(input(many(10, 3)));
    expect(parseMetrics(JSON.parse(JSON.stringify(m)))).toEqual(m);
  });
  it("từ chối dữ liệu khuyết / khác phiên bản / không phải object", () => {
    const m = computeInsights(input([]));
    for (const bad of [null, undefined, 5, "x", [], {}, { ...m, v: 2 }, { ...m, asOf: "không phải ngày" }, { ...m, skills: undefined }, { ...m, weak: {} }, { ...m, behavior: null }, { ...m, exams: 1 }]) {
      expect(parseMetrics(bad)).toBeNull();
    }
  });
});

describe("describeAction / actionHref", () => {
  it("câu lý do chỉ dùng số trong evidence", () => {
    expect(describeAction({ reason: "due_backlog", action: "review", cefr: "A1", evidence: { due: 23 } }).why).toContain("23");
    expect(describeAction({ reason: "weak_grammar_topic", action: "play", cefr: "A1", game: "tf", topic: "tenses", evidence: { topic: "tenses", acc: 40, n: 12 } })).toEqual({
      title: "Luyện ngữ pháp: tenses",
      why: "Chủ đề này bạn đúng 40% trong 12 câu gần đây, thấp hơn mức ổn định.",
    });
    expect(describeAction({ reason: "exam_gap", action: "learn", cefr: "B1", evidence: { missing: 7 } }).why).toContain("7 từ");
    expect(describeAction({ reason: "long_absence", action: "play", cefr: "A1", game: "quiz", evidence: { days: 9 } }).why).toContain("9 ngày");
  });
  it("mỗi mã lý do đều có câu chữ", () => {
    const codes = ["due_backlog", "weak_grammar_topic", "weak_skill", "exam_gap", "ready_for_exam", "streak_risk", "long_absence"] as const;
    for (const reason of codes) {
      const t = describeAction({ reason, action: "play", cefr: "A1", evidence: { due: 1, topic: "x", acc: 1, n: 1, skill: "Nghe", others: 1, missing: 1, streak: 1, days: 1 } });
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.why.length).toBeGreaterThan(0);
    }
  });
  it("liên kết chỉ là đường dẫn nội bộ", () => {
    expect(actionHref({ reason: "due_backlog", action: "review", cefr: "B1", evidence: {} })).toBe("/level/B1");
    expect(actionHref({ reason: "exam_gap", action: "learn", cefr: "B1", evidence: {} })).toBe("/learn/B1");
    expect(actionHref({ reason: "ready_for_exam", action: "exam", cefr: "B1", evidence: {} })).toBe("/exam/B1");
    expect(actionHref({ reason: "weak_skill", action: "play", cefr: "A2", game: "cloze", evidence: {} })).toBe("/play/cloze?cefr=A2");
  });
});
