import { nfc } from "./text";
import type { GameId, GrammarQ, Question, Sentence, StoredItem, Word } from "./types";

/**
 * Dựng câu hỏi cho từng trò (mục 2c: questions). Hàm thuần: ngẫu nhiên đi qua `rng` (mặc định Math.random),
 * dữ liệu phụ (đáp án nhiễu, câu ví dụ, ngữ pháp) do `server/repo` chuẩn bị rồi truyền vào.
 * Từ nào không dựng được câu hỏi (thiếu đáp án nhiễu, thiếu câu…) thì bị bỏ qua — kết quả có thể ít hơn `words`.
 */

export type Rng = () => number;

export type Pools = {
  /** wordId → các nghĩa tiếng Việt của từ KHÁC (cùng pos, cùng/liền kề cefr) — đáp án nhiễu cho quiz/blitz/listen. */
  viDistractors?: Record<number, string[]>;
  /** wordId → các từ tiếng Anh khác (cùng pos) — đáp án nhiễu cho cloze dạng chọn. Thiếu thì cloze chuyển sang gõ. */
  enDistractors?: Record<number, string[]>;
  /** wordId → câu thật chứa từ (cho cloze, build). */
  sentences?: Record<number, Sentence[]>;
  /** Câu ngữ pháp (cho tf; cho build khi từ không có câu). */
  grammar?: GrammarQ[];
};

export type BuildOptions = {
  rng?: Rng;
  /** Trò gõ từ: có gửi gợi ý (chữ cái đầu + số ký tự) không. Bài thi đặt false. */
  hints?: boolean;
  /** Không chấp nhận "gần đúng" ở câu gõ (bài thi). */
  strict?: boolean;
};

export const BLANK = "___";

export function shuffle<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Gợi ý cho trò gõ từ: chữ cái đầu, các chữ còn lại thành "_", giữ khoảng trắng ("ice cream" → "i__ c____"). */
export function maskWord(en: string): string {
  return en
    .split(" ")
    .map((w) => (w.length <= 1 ? w : w[0] + "_".repeat(w.length - 1)))
    .join(" ");
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function wordRegex(form: string): RegExp {
  const body = form.trim().split(/\s+/).map(escapeRe).join("\\s+");
  return new RegExp(`(?<![\\p{L}'\\-])${body}(?![\\p{L}'\\-])`, "iu");
}

/** Các dạng biến cách đơn giản của một từ đơn (không xử lý động từ bất quy tắc). */
export function inflections(en: string): string[] {
  if (/\s/.test(en)) return [];
  const last = en[en.length - 1];
  const out = [en + "s", en + "es", en + "ed", en + "d", en + "ing"];
  if (en.endsWith("e")) out.push(en.slice(0, -1) + "ing");
  if (en.endsWith("y")) out.push(en.slice(0, -1) + "ies", en.slice(0, -1) + "ied");
  if (/[bcdfghjklmnpqrstvwxz]/i.test(last)) out.push(en + last + "ed", en + last + "ing");
  return [...new Set(out)];
}

type Blank = { text: string; found: string; exact: boolean };

/** Thay từ trong câu bằng "___". exact = đúng dạng gốc; ngược lại là dạng biến cách tìm thấy trong câu. */
export function blankOut(sentence: string, word: string): Blank | null {
  const m = wordRegex(word).exec(sentence);
  if (m) return { text: sentence.slice(0, m.index) + BLANK + sentence.slice(m.index + m[0].length), found: m[0], exact: true };
  for (const form of inflections(word)) {
    const mi = wordRegex(form).exec(sentence);
    if (mi) return { text: sentence.slice(0, mi.index) + BLANK + sentence.slice(mi.index + mi[0].length), found: mi[0], exact: false };
  }
  return null;
}

const startsUpper = (s: string) => /^\p{Lu}/u.test(s);
const adaptCase = (s: string, upper: boolean) => (upper ? s.charAt(0).toUpperCase() + s.slice(1) : s.charAt(0).toLowerCase() + s.slice(1));

function uniqueNfc(list: string[], exclude: string[]): string[] {
  const seen = new Set(exclude.map(nfc));
  const out: string[] = [];
  for (const s of list) {
    const k = nfc(s);
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}

const meta = (w: Word) => ({ en: w.en, vi: w.vi });
const draft = (game: StoredItem["game"], prompt: string, expected: StoredItem["expected"], extra: Partial<StoredItem> = {}): StoredItem => ({
  qid: "",
  game,
  prompt,
  expected,
  ...extra,
});

// ---------- từng trò ----------

/** quiz / blitz / listen: chọn nghĩa tiếng Việt đúng trong 4 đáp án (3 nhiễu). */
function choice(game: "quiz" | "blitz" | "listen", w: Word, pools: Pools, rng: Rng): StoredItem | null {
  const distractors = uniqueNfc(pools.viDistractors?.[w.id] ?? [], [w.vi, ...(w.viAlt ?? [])]).slice(0, 3);
  const options = shuffle([w.vi, ...distractors], rng);
  if (options.length < 2) return null;
  // listen: trình duyệt đọc to `prompt` (từ tiếng Anh); quiz/blitz: hiển thị `prompt`.
  return draft(game, w.en, w.vi, { wordId: w.id, options, part: "vocab", meta: meta(w) });
}

function typing(w: Word, words: Word[], opts: BuildOptions): StoredItem {
  const alts = words.filter((o) => o.id !== w.id && nfc(o.vi) === nfc(w.vi)).map((o) => o.en);
  return draft("type", w.vi, w.en, {
    wordId: w.id,
    hint: opts.hints === false ? undefined : maskWord(w.en),
    alts: alts.length ? alts : undefined,
    strict: opts.strict,
    part: "vocab",
    meta: meta(w),
  });
}

function scramble(w: Word, rng: Rng): StoredItem | null {
  const letters = [...w.en.replace(/\s+/g, "")];
  if (letters.length < 2 || new Set(letters).size < 2) return null;
  let tokens = shuffle(letters, rng);
  for (let i = 0; i < 10 && tokens.join("") === letters.join(""); i++) tokens = shuffle(letters, rng);
  if (tokens.join("") === letters.join("")) return null;
  return draft("scramble", w.vi, w.en, { wordId: w.id, tokens, part: "vocab", meta: meta(w) });
}

/** cloze: điền từ vào câu thật. Dạng chọn khi có đáp án nhiễu tiếng Anh và từ xuất hiện đúng dạng gốc; còn lại là gõ. */
export function cloze(w: Word, pools: Pools, rng: Rng, opts: BuildOptions = {}): StoredItem | null {
  const sentences = shuffle(pools.sentences?.[w.id] ?? [], rng);
  let inflected: { s: Sentence; b: Blank } | null = null;
  for (const s of sentences) {
    const b = blankOut(s.en, w.en);
    if (!b) continue;
    if (b.exact) {
      const upper = startsUpper(b.found);
      const distractors = uniqueNfc(pools.enDistractors?.[w.id] ?? [], [w.en]).slice(0, 3);
      if (distractors.length >= 1) {
        const expected = adaptCase(w.en, upper);
        const options = shuffle([expected, ...distractors.map((d) => adaptCase(d, upper))], rng);
        return draft("cloze", b.text, expected, {
          wordId: w.id, sentenceId: s.id, options, hint: s.vi ?? undefined, part: "vocab", meta: meta(w),
        });
      }
      // không có đáp án nhiễu: gõ
      return draft("cloze", b.text, b.found, {
        wordId: w.id, sentenceId: s.id, hint: w.vi, strict: opts.strict, part: "vocab", meta: meta(w),
      });
    }
    inflected ??= { s, b };
  }
  if (inflected) {
    // dạng biến cách: gõ, kèm từ gốc trong ngoặc để người học biết cần chia lại
    return draft("cloze", inflected.b.text.replace(BLANK, `${BLANK} (${w.en})`), inflected.b.found, {
      wordId: w.id, sentenceId: inflected.s.id, hint: w.vi, strict: opts.strict, part: "vocab", meta: meta(w),
    });
  }
  return null;
}

/** Điền đáp án vào chỗ "___" của câu ngữ pháp. null nếu câu không có chỗ trống. */
export function fillGrammar(g: GrammarQ, optionIndex: number): string | null {
  if (!g.question.includes(BLANK)) return null;
  return g.question.replace(BLANK, g.options[optionIndex]);
}

function build(w: Word | null, pools: Pools, rng: Rng, usedGrammar: Set<number>): StoredItem | null {
  const MIN = 3;
  const MAX = 14;
  const tokensOf = (text: string) => text.trim().split(/\s+/);
  const make = (text: string, vi: string | null | undefined, extra: Partial<StoredItem>): StoredItem | null => {
    const expected = tokensOf(text);
    if (expected.length < MIN || expected.length > MAX) return null;
    let tokens = shuffle(expected, rng);
    for (let i = 0; i < 10 && tokens.join(" ") === expected.join(" "); i++) tokens = shuffle(expected, rng);
    if (tokens.join(" ") === expected.join(" ")) return null;
    return draft("build", vi || "Sắp xếp các từ thành câu đúng", expected, { tokens, ...extra });
  };

  if (w) {
    for (const s of shuffle(pools.sentences?.[w.id] ?? [], rng)) {
      const item = make(s.en, s.vi, { wordId: w.id, sentenceId: s.id, meta: meta(w) });
      if (item) return item;
    }
  }
  for (const g of shuffle(pools.grammar ?? [], rng)) {
    if (usedGrammar.has(g.id)) continue;
    const text = fillGrammar(g, g.answer - 1);
    const item = text && make(text, null, { grammarId: g.id, explanation: g.explanation ?? undefined });
    if (item) {
      usedGrammar.add(g.id);
      return item;
    }
  }
  return null;
}

/** tf: câu ngữ pháp đúng/sai. Chọn ngẫu nhiên điền đáp án đúng (true) hoặc một đáp án sai (false). */
function trueFalse(g: GrammarQ, rng: Rng): StoredItem | null {
  const wrong = g.options.map((_, i) => i).filter((i) => i !== g.answer - 1);
  const isTrue = wrong.length === 0 || rng() < 0.5;
  const idx = isTrue ? g.answer - 1 : wrong[Math.floor(rng() * wrong.length)];
  const text = fillGrammar(g, idx);
  if (!text) return null;
  return draft("tf", text, isTrue ? "true" : "false", { grammarId: g.id, explanation: g.explanation ?? undefined });
}

/** Một câu trắc nghiệm ngữ pháp (bài thi): game = "grammar". */
export function grammarChoice(g: GrammarQ, rng: Rng): StoredItem {
  return draft("grammar", g.question, g.options[g.answer - 1], {
    grammarId: g.id,
    options: shuffle(g.options, rng),
    part: "grammar",
    explanation: g.explanation ?? undefined,
  });
}

/** Đánh lại qid q1, q2, … theo thứ tự hiện tại. */
export function renumber(items: StoredItem[]): StoredItem[] {
  return items.map((it, i) => ({ ...it, qid: `q${i + 1}` }));
}

/**
 * Dựng các câu hỏi (kèm đáp án) cho một vòng. Thứ tự theo `words` (tf: theo `pools.grammar`).
 * Lưu kết quả vào game_rounds.items; gửi client qua `toClientItems`.
 */
export function buildQuestions(game: GameId, words: Word[], pools: Pools = {}, opts: BuildOptions = {}): StoredItem[] {
  const rng = opts.rng ?? Math.random;
  const items: (StoredItem | null)[] = [];

  switch (game) {
    case "quiz":
    case "blitz":
    case "listen":
      for (const w of words) items.push(choice(game, w, pools, rng));
      break;
    case "type":
      for (const w of words) items.push(typing(w, words, opts));
      break;
    case "scramble":
      for (const w of words) items.push(scramble(w, rng));
      break;
    case "cloze":
      for (const w of words) items.push(cloze(w, pools, rng, opts));
      break;
    case "match":
    case "flash":
      for (const w of words) items.push(draft(game, w.en, w.vi, { wordId: w.id, meta: meta(w) }));
      break;
    case "build": {
      const used = new Set<number>();
      for (const w of words) items.push(build(w, pools, rng, used));
      break;
    }
    case "tf":
      for (const g of pools.grammar ?? []) items.push(trueFalse(g, rng));
      break;
  }
  return renumber(items.filter((x): x is StoredItem => x !== null));
}

/** Phần gửi xuống trình duyệt: bỏ đáp án (trừ mặt sau của flash/match). */
export function toClientItems(items: StoredItem[]): Question[] {
  return items.map((it) => {
    const q: Question = { qid: it.qid, game: it.game, prompt: it.prompt };
    if (it.wordId !== undefined) q.wordId = it.wordId;
    if (it.grammarId !== undefined) q.grammarId = it.grammarId;
    if (it.sentenceId !== undefined) q.sentenceId = it.sentenceId;
    if (it.passageId !== undefined) q.passageId = it.passageId;
    if (it.options) q.options = it.options;
    if (it.tokens) q.tokens = it.tokens;
    if (it.hint) q.hint = it.hint;
    if ((it.game === "flash" || it.game === "match") && typeof it.expected === "string") q.back = it.expected;
    return q;
  });
}
