import { EXAM_SUBMIT_GRACE_SECONDS } from "./rules";
import { grammarChoice, buildQuestions, cloze, renumber, shuffle, type Pools, type Rng } from "./questions";
import { startOfNextVnDay, startOfVnDay } from "./streak";
import type { GradedItem } from "./grading";
import { passageItems } from "./passages";
import type { Cefr, GrammarQ, LevelStatus, PassageBundle, StoredItem, Word } from "./types";
import { GATED_LEVELS } from "./types";

/** Cấu hình bài kiểm tra lên cấp (content/taxonomy/levels.yml → `exam`). */
export type ExamConfig = {
  vocab: { total: number; mix: { quiz: number; cloze: number; type: number } };
  grammar: { total: number };
  durationMinutes: number;
  passTotal: number;
  passPart: number;
  cooldownMinutes: number;
  maxAttemptsPerDay: number;
  /** Số đoạn đọc / đoạn nghe mỗi đề (mỗi đoạn kèm toàn bộ câu hỏi active của nó). Thiếu hoặc 0 = không có phần này. */
  passages?: { reading: number; listening: number };
};

// ---------- điều kiện được bắt đầu thi (mục 5.13) ----------

export type ExamGateInput = {
  status: LevelStatus;
  /**
   * Bài đang dở của người này (finished_at IS NULL). Bài ĐÃ HẾT GIỜ phải được service đóng (fail_exam)
   * và tính vào lịch sử trước khi gọi hàm này; hàm bỏ qua bài đã hết hạn.
   */
  open?: { cefr: Cefr; expiresAt: Date } | null;
  /** started_at của mọi lượt thi (mọi cấp) kể từ 00:00 giờ VN hôm nay. */
  attemptsToday: Date[];
  /** Thời điểm kết thúc của lượt TRƯỢT gần nhất của đúng cấp này. */
  lastFailEndedAt?: Date | null;
  now: Date;
  cfg: ExamConfig;
};

export type ExamGateCode =
  | "NO_EXAM"
  | "LOCKED"
  | "ALREADY_PASSED"
  | "NOT_ELIGIBLE"
  | "OTHER_EXAM_OPEN"
  | "DAILY_LIMIT"
  | "COOLDOWN";

export type ExamGate =
  | { ok: true; resume: boolean; attemptsLeft: number }
  | { ok: false; code: ExamGateCode; attemptsLeft: number; nextAt?: Date; missingWords?: number };

/** Số lượt còn lại trong ngày VN hiện tại (mỗi lần BẮT ĐẦU thi là 1 lượt, mọi cấp). */
export function attemptsLeft(attemptsToday: Date[], now: Date, cfg: ExamConfig): number {
  const from = startOfVnDay(now).getTime();
  const used = attemptsToday.filter((t) => t.getTime() >= from).length;
  return Math.max(0, cfg.maxAttemptsPerDay - used);
}

export function checkExamStart(i: ExamGateInput): ExamGate {
  const left = attemptsLeft(i.attemptsToday, i.now, i.cfg);
  const fail = (code: ExamGateCode, extra: Partial<Extract<ExamGate, { ok: false }>> = {}): ExamGate => ({
    ok: false,
    code,
    attemptsLeft: left,
    ...extra,
  });
  const s = i.status;

  if (!(GATED_LEVELS as readonly Cefr[]).includes(s.cefr)) return fail("NO_EXAM");
  if (!s.unlocked) return fail("LOCKED"); // không thi nhảy cấp
  if (s.pass) return fail("ALREADY_PASSED");
  if (!s.eligible) return fail("NOT_ELIGIBLE", { missingWords: Math.max(0, s.needLearned - s.learnedCum) });

  // Bài đang dở, còn hạn → nhận lại đúng bài đó, không tốn lượt
  if (i.open && i.open.expiresAt.getTime() > i.now.getTime()) {
    if (i.open.cefr !== s.cefr) return fail("OTHER_EXAM_OPEN");
    return { ok: true, resume: true, attemptsLeft: left };
  }

  if (left <= 0) return fail("DAILY_LIMIT", { nextAt: startOfNextVnDay(i.now) });

  if (i.lastFailEndedAt) {
    const next = new Date(i.lastFailEndedAt.getTime() + i.cfg.cooldownMinutes * 60_000);
    if (next.getTime() > i.now.getTime()) return fail("COOLDOWN", { nextAt: next });
  }
  return { ok: true, resume: false, attemptsLeft: left };
}

export const examDeadline = (now: Date, cfg: ExamConfig): Date => new Date(now.getTime() + cfg.durationMinutes * 60_000);

/** Nộp trễ quá 30 giây sau hạn thì bị từ chối (và bài được tính trượt). */
export function isSubmitTooLate(now: Date, expiresAt: Date, graceSeconds = EXAM_SUBMIT_GRACE_SECONDS): boolean {
  return now.getTime() > expiresAt.getTime() + graceSeconds * 1000;
}

// ---------- dựng đề ----------

export type ExamPools = Pools & {
  /** Ngữ pháp của đúng cấp, đã lấy ngẫu nhiên (cột rand). */
  grammarQuestions: GrammarQ[];
  /** Đoạn đọc / nghe đã bốc (kèm câu hỏi). Thiếu thì đề chỉ có từ vựng + ngữ pháp. */
  passages?: PassageBundle[];
};

/**
 * Dựng đề: `cfg.vocab.total` câu từ vựng (quiz / cloze / gõ từ theo `mix`) + `cfg.grammar.total` câu ngữ pháp,
 * xáo trộn rồi đánh lại qid. `words` nên nhiều hơn total một chút để bù từ không dựng được câu hỏi.
 *  - gõ từ: KHÔNG gợi ý, KHÔNG chấp nhận gần đúng (strict)
 *  - cloze không có câu ví dụ dùng được → chuyển thành quiz
 *  - không dùng trò listen
 *  - đoạn đọc / nghe (nếu có) được nối SAU cùng, bài đọc trước bài nghe, các câu của một đoạn liền nhau
 * Có thể trả ít câu hơn cấu hình nếu nội dung quá thiếu; điểm được tính trên số câu thật (xem scoreExam).
 */
export function buildExamItems(words: Word[], pools: ExamPools, cfg: ExamConfig, rng: Rng = Math.random): StoredItem[] {
  const { quiz: nQuiz, cloze: nCloze, type: nType } = cfg.vocab.mix;
  const shuffled = shuffle(words, rng);
  const vocab: StoredItem[] = [];
  const used = new Set<number>();
  const take = (n: number, make: (w: Word) => StoredItem | null) => {
    let got = 0;
    for (const w of shuffled) {
      if (got >= n) break;
      if (used.has(w.id)) continue;
      const item = make(w);
      if (item) {
        used.add(w.id);
        vocab.push(item);
        got++;
      }
    }
  };
  const quizOf = (w: Word) => buildQuestions("quiz", [w], pools, { rng })[0] ?? null;

  // Thứ tự ưu tiên: cloze (khó dựng nhất), gõ từ, rồi quiz lấp phần còn thiếu
  take(nCloze, (w) => cloze(w, pools, rng, { strict: true }));
  take(nType, (w) => buildQuestions("type", [w], pools, { rng, hints: false, strict: true })[0] ?? null);
  take(Math.max(nQuiz, cfg.vocab.total - vocab.length), quizOf);

  const grammar = shuffle(pools.grammarQuestions, rng)
    .slice(0, cfg.grammar.total)
    .map((g) => grammarChoice(g, rng));

  const core = shuffle([...vocab.slice(0, cfg.vocab.total), ...grammar], rng);
  return renumber([...core, ...passageItems(pools.passages ?? [], rng)]);
}

// ---------- chấm đề ----------

export type ExamScore = { passed: boolean; total: number; vocab: number; grammar: number; reading?: number; listening?: number };

const ratio = (right: number, n: number) => (n === 0 ? 0 : right / n);
const EPS = 1e-9;

/**
 * Điểm bài thi (mục 4.6): tổng ≥ passTotal VÀ từ vựng ≥ passPart VÀ ngữ pháp ≥ passPart,
 * VÀ (nếu đề có) bài đọc ≥ passPart, bài nghe ≥ passPart.
 * Mẫu số là số câu THỰC có trong đề của từng phần; câu bỏ trống tính là sai.
 * `reading` / `listening` chỉ có trong kết quả khi đề thật sự có phần đó.
 */
export function scoreExam(graded: GradedItem[], cfg: ExamConfig): ExamScore {
  const part = (p: "vocab" | "grammar" | "reading" | "listening") => graded.filter((g) => g.item.part === p);
  const right = (xs: GradedItem[]) => xs.filter((g) => g.correct).length;
  const v = part("vocab");
  const g = part("grammar");
  const r = part("reading");
  const l = part("listening");
  const all = [...v, ...g, ...r, ...l];
  const vocab = ratio(right(v), v.length);
  const grammar = ratio(right(g), g.length);
  const reading = ratio(right(r), r.length);
  const listening = ratio(right(l), l.length);
  const total = ratio(right(all), all.length);
  const passed =
    v.length > 0 && g.length > 0 &&
    total >= cfg.passTotal - EPS && vocab >= cfg.passPart - EPS && grammar >= cfg.passPart - EPS &&
    (r.length === 0 || reading >= cfg.passPart - EPS) &&
    (l.length === 0 || listening >= cfg.passPart - EPS);
  return { passed, total, vocab, grammar, ...(r.length ? { reading } : {}), ...(l.length ? { listening } : {}) };
}
