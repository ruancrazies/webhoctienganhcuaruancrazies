import type { ReactNode } from "react";
import { ExplainButton } from "./ExplainButton";
import { PART_LABEL, pct } from "@/lib/format";

/**
 * Phần hiển thị kết quả bài thi / bài kiểm tra DÙNG CHUNG cho màn hình ngay sau khi nộp (ExamRunner, TestRunner)
 * và màn hình xem lại (/results/[type]/[id]) — để hai nơi luôn giống nhau (thiết kế mục 7).
 * Không có state/hook nên dùng được ở cả server lẫn client component.
 */

export type ScorePart = {
  label: string;
  /** 0..1 */
  value: number;
  /** Chú thích nhỏ dưới điểm, ví dụ "cần 70%" hoặc "12 câu". */
  note?: string;
  /** Có đạt ngưỡng của phần này không (tô xanh/đỏ). Bỏ trống = không tô. */
  ok?: boolean;
};

type Scores = { vocab: number; grammar: number; reading: number | null; listening: number | null };
/** ExamResult / PracticeResult dùng tên scoreVocab…, còn ResultScores dùng vocab…: đổi về một dạng. */
export const scoresOfResult = (r: { scoreVocab: number; scoreGrammar: number; scoreReading: number | null; scoreListening: number | null }): Scores => ({
  vocab: r.scoreVocab,
  grammar: r.scoreGrammar,
  reading: r.scoreReading,
  listening: r.scoreListening,
});

type PartOpts = {
  /** Ngưỡng đạt của mỗi phần (bài thi lên cấp). */
  passPart?: number;
  /** Số câu mỗi phần (bài kiểm tra / xem lại). */
  counts?: Partial<Record<keyof typeof PART_LABEL, number>>;
};

/** Bốn ô điểm theo phần. Phần reading/listening null (đề không có) thì bỏ qua. */
export function scoreParts(s: Scores, o: PartOpts = {}): ScorePart[] {
  const make = (key: keyof typeof PART_LABEL, value: number | null): ScorePart[] => {
    if (value === null) return [];
    const note = o.passPart !== undefined ? `cần ${pct(o.passPart)}` : o.counts?.[key] !== undefined ? `${o.counts[key]} câu` : undefined;
    return [{ label: PART_LABEL[key], value, note, ok: o.passPart !== undefined ? value >= o.passPart : undefined }];
  };
  return [...make("vocab", s.vocab), ...make("grammar", s.grammar), ...make("reading", s.reading), ...make("listening", s.listening)];
}

export function ScoreSummary({
  heading,
  total,
  failed,
  verdict,
  passVerdict,
  parts,
  aboveParts,
  children,
}: {
  heading: string;
  /** 0..1 */
  total: number;
  /** Tô dấu "trượt" (viền đôi) cho vòng điểm. */
  failed?: boolean;
  verdict?: string;
  passVerdict?: boolean;
  parts: ScorePart[];
  /** Nằm dưới điểm/lời phán, trên các ô điểm theo phần. */
  aboveParts?: ReactNode;
  /** Nằm dưới các ô điểm theo phần. */
  children?: ReactNode;
}) {
  const t = Math.round(total * 100);
  return (
    <section className="sheet" aria-labelledby="res-h">
      <div className="grade">
        <h1 id="res-h" style={{ fontSize: 14, fontWeight: 600, color: "var(--pencil)" }}>{heading}</h1>
        <div className={`score${failed ? " fail" : ""}`} aria-label={`Điểm tổng ${t} phần trăm`}>{t}%</div>
        {verdict ? <p className={`verdict${passVerdict ? " pass" : ""}`}>{verdict}</p> : null}
        {aboveParts}
      </div>
      <div className="parts">
        {parts.map((p) => (
          <div key={p.label} className={`part${p.ok === undefined ? "" : p.ok ? " good" : " bad"}`}>
            <b>{pct(p.value)}</b>
            <span className="muted small">{p.label}{p.note ? ` (${p.note})` : ""}</span>
          </div>
        ))}
      </div>
      {children}
    </section>
  );
}

const asText = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(" ") : (v ?? ""));

/** Một câu để hiện: ReviewItem (chỉ câu sai, ngay sau khi nộp) hoặc ReviewedItem (đủ câu, xem lại). */
export type AnswerRow = {
  qid: string;
  game: string;
  prompt: string;
  expected: string | string[];
  yourAnswer?: string | string[];
  /** true = đúng. Bỏ trống hoặc false = sai (danh sách "các câu làm sai" không cần truyền). */
  correct?: boolean;
  near?: boolean;
  options?: string[];
  explanation?: string;
  en?: string;
  vi?: string;
  /** Số thứ tự trong đề (chỉ màn xem lại). */
  index?: number;
};

export function AnswerList({
  items,
  labelledBy,
  explain,
}: {
  items: AnswerRow[];
  labelledBy?: string;
  /** Bài đã nộp đang xem lại. Có thì câu sai (chưa có giải thích sẵn, không phải bài đọc/nghe) hiện nút "Giải thích vì sao sai". */
  explain?: { type: "exam" | "practice"; id: string };
}) {
  return (
    <div className="review" role="list" aria-labelledby={labelledBy}>
      {items.map((r) => {
        const ok = r.correct === true;
        const mine = asText(r.yourAnswer);
        return (
          <article key={r.qid} className={`rv${ok ? " right" : ""}`} role="listitem">
            <p className="q">
              {r.index !== undefined ? <span className="rv-n">Câu {r.index}. </span> : null}
              {r.prompt.replace("___", "_____")}
              {r.index !== undefined ? <span className={`chip ${ok ? "chip-good" : "chip-red"} rv-chip`}>{ok ? (r.near ? "Đúng (gần đúng)" : "Đúng") : mine === "" ? "Bỏ trống" : "Sai"}</span> : null}
            </p>
            {ok && !r.near ? (
              <p>Bạn trả lời: <span className="ok">{mine}</span></p>
            ) : (
              <>
                <p>Đáp án đúng: <span className="ok">{asText(r.expected)}</span></p>
                <p className="muted small">
                  Bạn trả lời: {mine !== "" ? <span className={ok ? "ok" : "no"}>{mine}</span> : "(bỏ trống)"}
                </p>
              </>
            )}
            {r.en && r.vi && r.game !== "grammar" && r.game !== "passage" ? <p className="muted small">{r.en} = {r.vi}</p> : null}
            {r.explanation ? <p className="small">{r.explanation}</p> : null}
            {explain && !ok && !r.explanation && r.game !== "passage" ? <ExplainButton type={explain.type} id={explain.id} qid={r.qid} /> : null}
          </article>
        );
      })}
    </div>
  );
}
