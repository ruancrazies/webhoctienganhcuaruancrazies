"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PassagePanel, PassageReveal } from "@/components/PassagePanel";
import { QuestionCard } from "@/components/QuestionCard";
import { ApiFail, apiPost, errorMessage } from "@/lib/api";
import { LEVEL_NAMES, fmtClock, fmtNumber, fmtVnTime, pct } from "@/lib/format";
import { sfx } from "@/lib/sound";
import type { Cefr, ClientPassage, Question } from "@/core/types";
import type { ExamResult, ExamStartResponse } from "@/types/api";

export type ExamInfo = {
  vocabTotal: number;
  grammarTotal: number;
  readingPassages: number;
  listeningPassages: number;
  durationMinutes: number;
  passTotal: number;
  passPart: number;
  cooldownMinutes: number;
  maxAttemptsPerDay: number;
};
type Gate = { unlocked: boolean; pass: boolean; eligible: boolean; learnedCum: number; needLearned: number };

type Phase =
  | { t: "intro" }
  | { t: "starting" }
  | { t: "running"; examId: string; items: Question[]; passages: ClientPassage[]; expiresAt: number; resumed: boolean }
  | { t: "submitting"; examId: string; items: Question[]; passages: ClientPassage[]; expiresAt: number; resumed: boolean }
  | { t: "result"; result: ExamResult }
  | { t: "expired"; message: string };

const storeKey = (id: string) => `eg-exam:${id}`;

function readSaved(examId: string): { answers: Record<string, string>; idx: number } {
  try {
    const raw = sessionStorage.getItem(storeKey(examId));
    if (raw) {
      const p = JSON.parse(raw) as { answers?: Record<string, string>; idx?: number };
      return { answers: p.answers ?? {}, idx: p.idx ?? 0 };
    }
  } catch {
    /* bỏ qua */
  }
  return { answers: {}, idx: 0 };
}

/** Lý do không bắt đầu được → câu giải thích cho người dùng. */
function startFailure(e: ApiFail): string {
  const nextAt = typeof e.extra.nextAt === "string" ? e.extra.nextAt : undefined;
  switch (e.code) {
    case "DAILY_LIMIT":
      return `Bạn đã dùng hết lượt thi hôm nay.${nextAt ? ` Có thể thi lại từ ${fmtVnTime(nextAt)}.` : ""}`;
    case "COOLDOWN":
      return `Cần chờ sau lượt thi không đạt.${nextAt ? ` Bạn thi lại được từ ${fmtVnTime(nextAt)}.` : ""}`;
    case "NOT_ELIGIBLE":
      return `Cần học thêm ${fmtNumber(Number(e.extra.missingWords ?? 0))} từ mới được thi cấp này.`;
    case "OTHER_EXAM_OPEN":
      return "Bạn đang có một bài thi ở cấp khác chưa nộp. Hãy nộp bài đó trước.";
    default:
      return e.message;
  }
}

export function ExamRunner({ cefr, info, next, gate }: { cefr: Cefr; info: ExamInfo; next: Cefr | null; gate: Gate }) {
  const [phase, setPhase] = useState<Phase>({ t: "intro" });
  const [startError, setStartError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setStartError(null);
    setPhase({ t: "starting" });
    try {
      const r = await apiPost<ExamStartResponse>("/api/exam/start", { cefr });
      setPhase({ t: "running", examId: r.examId, items: r.items, passages: r.passages ?? [], expiresAt: new Date(r.expiresAt).getTime(), resumed: r.resumed });
    } catch (e) {
      setStartError(e instanceof ApiFail ? startFailure(e) : errorMessage(e));
      setPhase({ t: "intro" });
    }
  }, [cefr]);

  if (phase.t === "result") {
    return <ResultView cefr={cefr} next={next} info={info} result={phase.result} />;
  }

  if (phase.t === "expired") {
    return (
      <div className="stack">
        <Link href={`/level/${cefr}`} className="back">‹ Cấp {cefr}</Link>
        <div className="sheet sheet-plain state" role="alert">
          <div className="big" aria-hidden="true">⌛</div>
          <h2>Bài thi đã bị đóng</h2>
          <p className="muted">{phase.message}</p>
          <Link href={`/level/${cefr}`} className="btn">Về cấp {cefr}</Link>
        </div>
      </div>
    );
  }

  if (phase.t === "running" || phase.t === "submitting") {
    return (
      <Running
        key={phase.examId}
        cefr={cefr}
        info={info}
        examId={phase.examId}
        items={phase.items}
        passages={phase.passages}
        expiresAt={phase.expiresAt}
        resumed={phase.resumed}
        submitting={phase.t === "submitting"}
        onSubmitting={() => setPhase((p) => (p.t === "running" ? { ...p, t: "submitting" } : p))}
        onBackToRun={() => setPhase((p) => (p.t === "submitting" ? { ...p, t: "running" } : p))}
        onResult={(result) => {
          try {
            sessionStorage.removeItem(storeKey(phase.examId));
          } catch {
            /* bỏ qua */
          }
          sfx(result.passed ? "levelup" : "done");
          setPhase({ t: "result", result });
        }}
        onClosed={(message) => setPhase({ t: "expired", message })}
      />
    );
  }

  // intro / starting
  const blocked = !gate.unlocked || gate.pass;
  const canTry = !blocked && gate.eligible;
  const missing = Math.max(0, gate.needLearned - gate.learnedCum);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <Link href={`/level/${cefr}`} className="back">‹ Cấp {cefr}</Link>
      <header className="stack" style={{ gap: 6 }}>
        <h1>Thi lên cấp {cefr}</h1>
        <p className="muted">{LEVEL_NAMES[cefr]}{next ? `. Đạt bài này sẽ mở cấp ${next}.` : "."}</p>
      </header>

      {!gate.unlocked ? (
        <p className="gate gate-bad">Cấp {cefr} đang khóa: bạn phải qua bài kiểm tra cấp trước. Không thi nhảy cấp.</p>
      ) : gate.pass ? (
        <p className="gate gate-ok">Bạn đã qua cấp {cefr}.</p>
      ) : !gate.eligible ? (
        <p className="gate">
          Chưa đủ điều kiện: đã học {fmtNumber(gate.learnedCum)}/{fmtNumber(gate.needLearned)} từ (tính từ A1). Học thêm {fmtNumber(missing)} từ nữa để được thi.
        </p>
      ) : (
        <p className="gate gate-ok">Bạn đủ điều kiện thi cấp {cefr}.</p>
      )}

      <section className="sheet" aria-labelledby="rule-h">
        <h2 id="rule-h" style={{ marginBottom: 10 }}>Thể lệ</h2>
        <ul className="rules">
          <li>{info.vocabTotal + info.grammarTotal} câu: {info.vocabTotal} câu từ vựng (chọn nghĩa, điền vào câu, gõ từ) và {info.grammarTotal} câu ngữ pháp.{info.readingPassages + info.listeningPassages > 0 ? ` Ngoài ra có ${[info.readingPassages > 0 ? `${info.readingPassages} bài đọc` : "", info.listeningPassages > 0 ? `${info.listeningPassages} bài nghe` : ""].filter(Boolean).join(" và ")} kèm câu hỏi (nếu cấp này đã có bài).` : ""}</li>
          <li>Làm trong {info.durationMinutes} phút. Hết giờ mà chưa nộp thì tính là trượt.</li>
          <li>Đạt khi tổng điểm từ {pct(info.passTotal)}, và mỗi phần (từ vựng, ngữ pháp, bài đọc, bài nghe nếu đề có) từ {pct(info.passPart)}.</li>
          <li>Câu gõ từ phải đúng chính tả, không có gợi ý. Câu bỏ trống tính là sai.</li>
          <li>Tối đa {info.maxAttemptsPerDay} lượt mỗi ngày. Không đạt thì chờ {info.cooldownMinutes} phút mới thi lại cấp này.</li>
          <li>Bài thi không cộng XP và không ảnh hưởng lịch ôn từ.</li>
        </ul>
      </section>

      {startError ? <p className="err" role="alert">{startError}</p> : null}

      <div className="row">
        <button type="button" className="btn btn-mark" disabled={!canTry || phase.t === "starting"} onClick={() => void start()}>
          {phase.t === "starting" ? "Đang tạo đề…" : "Bắt đầu thi"}
        </button>
        {!gate.eligible && gate.unlocked && !gate.pass ? (
          <Link href={`/level/${cefr}`} className="btn btn-light">Vào học thêm</Link>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */

type RunningProps = {
  cefr: Cefr;
  info: ExamInfo;
  examId: string;
  items: Question[];
  passages: ClientPassage[];
  expiresAt: number;
  resumed: boolean;
  submitting: boolean;
  onSubmitting: () => void;
  onBackToRun: () => void;
  onResult: (r: ExamResult) => void;
  onClosed: (message: string) => void;
};

function Running({ cefr, examId, items, passages, expiresAt, resumed, submitting, onSubmitting, onBackToRun, onResult, onClosed }: RunningProps) {
  const saved = useMemo(() => readSaved(examId), [examId]);
  const [answers, setAnswers] = useState<Record<string, string>>(saved.answers);
  const [idx, setIdx] = useState(Math.min(saved.idx, items.length - 1));
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sent = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  // lưu tạm để tải lại trang không mất bài đang làm
  useEffect(() => {
    try {
      sessionStorage.setItem(storeKey(examId), JSON.stringify({ answers, idx }));
    } catch {
      /* bỏ qua */
    }
  }, [answers, idx, examId]);

  // cảnh báo khi rời trang giữa chừng
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  const submit = useCallback(async () => {
    if (sent.current) return;
    sent.current = true;
    setConfirming(false);
    setError(null);
    onSubmitting();
    const payload = items
      .map((q) => ({ qid: q.qid, value: (answersRef.current[q.qid] ?? "").trim() }))
      .filter((a) => a.value !== "");
    try {
      const result = await apiPost<ExamResult>("/api/exam/submit", { examId, answers: payload });
      onResult(result);
    } catch (e) {
      if (e instanceof ApiFail && (e.code === "EXAM_EXPIRED" || e.code === "EXAM_INVALID")) {
        onClosed(e.code === "EXAM_EXPIRED" ? "Bạn nộp quá hạn nên bài này tính là một lượt trượt." : "Bài thi này đã kết thúc hoặc không còn hiệu lực.");
        return;
      }
      sent.current = false;
      setError(errorMessage(e));
      onBackToRun();
    }
  }, [examId, items, onBackToRun, onClosed, onResult, onSubmitting]);

  // đếm ngược theo giờ máy chủ gửi về (expiresAt); hết giờ thì tự nộp
  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) void submit();
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [expiresAt, submit]);

  const q = items[idx];
  const passage = q.passageId !== undefined ? passages.find((x) => x.id === q.passageId) : undefined;
  const answered = items.filter((it) => (answers[it.qid] ?? "").trim() !== "").length;
  const unanswered = items.length - answered;
  const low = remaining <= 120;

  const set = (v: string) => setAnswers((a) => ({ ...a, [q.qid]: v }));
  const go = (i: number) => {
    setConfirming(false);
    setIdx(Math.max(0, Math.min(items.length - 1, i)));
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="exam-head">
        <div className="spread">
          <b>Thi cấp {cefr}</b>
          <span className={`timer${low ? " low" : ""}`} role="timer" aria-label={`Còn ${fmtClock(remaining)}`}>
            ⏱ {fmtClock(remaining)}
          </span>
        </div>
        <div className="spread small">
          <span>Câu {idx + 1}/{items.length}</span>
          <span className="muted">Đã trả lời {answered}/{items.length}</span>
        </div>
        <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={answered} aria-label="Số câu đã trả lời">
          <i style={{ width: `${(answered / items.length) * 100}%` }} />
        </div>
      </div>

      {resumed ? <p className="gate">Bạn đang có bài thi dở nên hệ thống mở lại đúng bài đó (không tốn thêm lượt).</p> : null}
      {error ? <p className="err" role="alert">{error}. Bài của bạn vẫn được giữ, hãy thử nộp lại.</p> : null}

      {passage ? <PassagePanel key={passage.id} passage={passage} /> : null}

      <section className="sheet" aria-live="polite">
        <QuestionCard key={q.qid} q={q} value={answers[q.qid] ?? ""} onChange={set} disabled={submitting} onEnter={() => (idx < items.length - 1 ? go(idx + 1) : undefined)} />
      </section>

      <div className="spread">
        <button type="button" className="btn btn-light" disabled={idx === 0 || submitting} onClick={() => go(idx - 1)}>Câu trước</button>
        {idx < items.length - 1 ? (
          <button type="button" className="btn" disabled={submitting} onClick={() => go(idx + 1)}>Câu sau</button>
        ) : (
          <button type="button" className="btn btn-mark" disabled={submitting} onClick={() => setConfirming(true)}>Nộp bài</button>
        )}
      </div>

      <section className="sheet sheet-plain stack" aria-label="Danh sách câu hỏi">
        <div className="spread">
          <h3>Danh sách câu</h3>
          <button type="button" className="btn btn-light btn-sm" disabled={submitting} onClick={() => setConfirming(true)}>Nộp bài</button>
        </div>
        <div className="qnav">
          {items.map((it, i) => {
            const done = (answers[it.qid] ?? "").trim() !== "";
            return (
              <button
                key={it.qid}
                type="button"
                className={`qdot${i === idx ? " now" : done ? " done" : " skip"}`}
                onClick={() => go(i)}
                aria-label={`Câu ${i + 1}${done ? ", đã trả lời" : ", chưa trả lời"}`}
                aria-current={i === idx ? "step" : undefined}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </section>

      {confirming || submitting ? (
        <section className="sheet" role="alertdialog" aria-labelledby="cf-h" style={{ borderColor: "var(--red)" }}>
          <div className="stack">
            <h2 id="cf-h">Nộp bài?</h2>
            <p className="muted">
              {unanswered > 0 ? `Còn ${unanswered} câu chưa trả lời (tính là sai). ` : "Bạn đã trả lời hết các câu. "}
              Nộp rồi không sửa được.
            </p>
            <div className="row">
              <button type="button" className="btn btn-red" disabled={submitting} onClick={() => void submit()}>
                {submitting ? "Đang chấm bài…" : "Nộp bài"}
              </button>
              <button type="button" className="btn btn-light" disabled={submitting} onClick={() => setConfirming(false)}>Làm tiếp</button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */

const asText = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(" ") : (v ?? ""));

function ResultView({ cefr, next, info, result }: { cefr: Cefr; next: Cefr | null; info: ExamInfo; result: ExamResult }) {
  const total = Math.round(result.scoreTotal * 100);
  const vocabOk = result.scoreVocab >= info.passPart;
  const grammarOk = result.scoreGrammar >= info.passPart;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="sheet" aria-labelledby="res-h">
        <div className="grade">
          <h1 id="res-h" className="verdict-wrap" style={{ fontSize: 14, fontWeight: 600, color: "var(--pencil)" }}>Kết quả thi cấp {cefr}</h1>
          <div className={`score${result.passed ? "" : " fail"}`} aria-label={`Điểm tổng ${total} phần trăm`}>{total}%</div>
          <p className={`verdict${result.passed ? " pass" : ""}`}>{result.passed ? `Đạt! Bạn đã qua cấp ${cefr}` : "Chưa đạt"}</p>
          {result.passed && next ? <p className="muted">Cấp {next} đã được mở.</p> : null}
          {result.passed && !next ? <p className="muted">Bạn đã hoàn thành lộ trình.</p> : null}
        </div>
        <div className="parts">
          <div className={`part ${vocabOk ? "good" : "bad"}`}>
            <b>{pct(result.scoreVocab)}</b>
            <span className="muted small">Từ vựng (cần {pct(info.passPart)})</span>
          </div>
          <div className={`part ${grammarOk ? "good" : "bad"}`}>
            <b>{pct(result.scoreGrammar)}</b>
            <span className="muted small">Ngữ pháp (cần {pct(info.passPart)})</span>
          </div>
          {result.scoreReading !== null ? (
            <div className={`part ${result.scoreReading >= info.passPart ? "good" : "bad"}`}>
              <b>{pct(result.scoreReading)}</b>
              <span className="muted small">Bài đọc (cần {pct(info.passPart)})</span>
            </div>
          ) : null}
          {result.scoreListening !== null ? (
            <div className={`part ${result.scoreListening >= info.passPart ? "good" : "bad"}`}>
              <b>{pct(result.scoreListening)}</b>
              <span className="muted small">Bài nghe (cần {pct(info.passPart)})</span>
            </div>
          ) : null}
        </div>
        <p className="muted small" style={{ marginTop: 12 }}>
          Điều kiện đạt: tổng từ {pct(info.passTotal)}, mỗi phần từ {pct(info.passPart)}.
        </p>
        {!result.passed ? (
          <p className="gate" style={{ marginTop: 12 }}>
            {result.nextAttemptAt ? `Bạn thi lại cấp này được từ ${fmtVnTime(result.nextAttemptAt)}. ` : ""}
            Hôm nay còn {result.attemptsLeftToday} lượt thi.
          </p>
        ) : null}
      </section>

      <div className="row">
        {result.passed && next ? <Link href={`/level/${next}`} className="btn btn-mark">Vào cấp {next}</Link> : null}
        <Link href={`/learn/${cefr}?domain=general`} className="btn btn-light">Ôn lại từ vựng</Link>
        <Link href="/" className="btn btn-light">Trang chủ</Link>
      </div>

      <PassageReveal passages={result.passages ?? []} />

      {result.review.length > 0 ? (
        <section className="stack" aria-labelledby="rv-h">
          <h2 id="rv-h">Các câu làm sai ({result.review.length})</h2>
          <div className="review">
            {result.review.map((r) => (
              <article key={r.qid} className="rv">
                <p className="q">{r.prompt.replace("___", "_____")}</p>
                <p>
                  Đáp án đúng: <span className="ok">{asText(r.expected)}</span>
                </p>
                <p className="muted small">
                  Bạn trả lời: {r.yourAnswer !== undefined && asText(r.yourAnswer) !== "" ? <span className="no">{asText(r.yourAnswer)}</span> : "(bỏ trống)"}
                </p>
                {r.en && r.vi && r.game !== "grammar" && r.game !== "passage" ? <p className="muted small">{r.en} = {r.vi}</p> : null}
                {r.explanation ? <p className="small">{r.explanation}</p> : null}
              </article>
            ))}
          </div>
        </section>
      ) : (
        <p className="muted">Bạn không sai câu nào.</p>
      )}
    </div>
  );
}
