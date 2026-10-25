"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PassagePanel, PassageReveal } from "@/components/PassagePanel";
import { QuestionCard } from "@/components/QuestionCard";
import { ApiFail, apiPost, errorMessage } from "@/lib/api";
import { fmtClock, fmtNumber, fmtVnTime, pct } from "@/lib/format";
import { sfx } from "@/lib/sound";
import type { ClientPassage, Question } from "@/core/types";
import type { PracticeOverview, PracticeResult, PracticeStartResponse } from "@/types/api";

type Phase =
  | { t: "intro" }
  | { t: "starting" }
  | { t: "running"; testId: string; items: Question[]; passages: ClientPassage[]; expiresAt: number; resumed: boolean }
  | { t: "submitting"; testId: string; items: Question[]; passages: ClientPassage[]; expiresAt: number; resumed: boolean }
  | { t: "result"; result: PracticeResult }
  | { t: "expired"; message: string };

const storeKey = (id: string) => `eg-test:${id}`;

function readSaved(testId: string): { answers: Record<string, string>; idx: number } {
  try {
    const raw = sessionStorage.getItem(storeKey(testId));
    if (raw) {
      const p = JSON.parse(raw) as { answers?: Record<string, string>; idx?: number };
      return { answers: p.answers ?? {}, idx: p.idx ?? 0 };
    }
  } catch {
    /* bỏ qua */
  }
  return { answers: {}, idx: 0 };
}

function startFailure(e: ApiFail): string {
  if (e.code === "NOT_ENOUGH_WORDS") return `Bạn mới học ${fmtNumber(Number(e.extra.learned ?? 0))} từ. Cần học ít nhất ${fmtNumber(Number(e.extra.need ?? 0))} từ để làm bài kiểm tra.`;
  return e.message;
}

export function TestRunner({ overview }: { overview: PracticeOverview }) {
  const [phase, setPhase] = useState<Phase>({ t: "intro" });
  const [startError, setStartError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setStartError(null);
    setPhase({ t: "starting" });
    try {
      const r = await apiPost<PracticeStartResponse>("/api/test/start", {});
      setPhase({ t: "running", testId: r.testId, items: r.items, passages: r.passages ?? [], expiresAt: new Date(r.expiresAt).getTime(), resumed: r.resumed });
    } catch (e) {
      setStartError(e instanceof ApiFail ? startFailure(e) : errorMessage(e));
      setPhase({ t: "intro" });
    }
  }, []);

  if (phase.t === "result") return <ResultView result={phase.result} onAgain={() => setPhase({ t: "intro" })} />;

  if (phase.t === "expired") {
    return (
      <div className="sheet sheet-plain state" role="alert">
        <div className="big" aria-hidden="true">⌛</div>
        <h2>Bài kiểm tra đã bị đóng</h2>
        <p className="muted">{phase.message}</p>
        <button type="button" className="btn" onClick={() => setPhase({ t: "intro" })}>Làm bài mới</button>
      </div>
    );
  }

  if (phase.t === "running" || phase.t === "submitting") {
    return (
      <Running
        key={phase.testId}
        testId={phase.testId}
        items={phase.items}
        passages={phase.passages}
        expiresAt={phase.expiresAt}
        resumed={phase.resumed}
        submitting={phase.t === "submitting"}
        onSubmitting={() => setPhase((p) => (p.t === "running" ? { ...p, t: "submitting" } : p))}
        onBackToRun={() => setPhase((p) => (p.t === "submitting" ? { ...p, t: "running" } : p))}
        onResult={(result) => {
          try {
            sessionStorage.removeItem(storeKey(phase.testId));
          } catch {
            /* bỏ qua */
          }
          sfx("done");
          setPhase({ t: "result", result });
        }}
        onClosed={(message) => setPhase({ t: "expired", message })}
      />
    );
  }

  const enough = overview.canStart;
  return (
    <div className="stack" style={{ gap: 20 }}>
      {enough ? (
        <p className="gate gate-ok">
          {overview.hasOpen ? "Bạn có một bài đang làm dở, bấm tiếp tục để mở lại." : `Bạn đã học ${fmtNumber(overview.learnedWords)} từ, đủ để làm bài kiểm tra.`}
        </p>
      ) : (
        <p className="gate">
          Mới học {fmtNumber(overview.learnedWords)}/{fmtNumber(overview.minWords)} từ. Học thêm {fmtNumber(overview.minWords - overview.learnedWords)} từ nữa để mở bài kiểm tra.
        </p>
      )}

      <section className="sheet" aria-labelledby="rule-h">
        <h2 id="rule-h" style={{ marginBottom: 10 }}>Thể lệ</h2>
        <ul className="rules">
          <li>{overview.vocabTotal + overview.grammarTotal} câu: {overview.vocabTotal} câu từ vựng (chọn nghĩa, điền vào câu, gõ từ) lấy từ những từ bạn đã học, và {overview.grammarTotal} câu ngữ pháp.{overview.readingPassages + overview.listeningPassages > 0 ? ` Ngoài ra có ${[overview.readingPassages > 0 ? `${overview.readingPassages} bài đọc` : "", overview.listeningPassages > 0 ? `${overview.listeningPassages} bài nghe` : ""].filter(Boolean).join(" và ")} kèm câu hỏi (nếu cấp của bạn đã có bài).` : ""}</li>
          <li>Làm trong {overview.durationMinutes} phút. Câu gõ từ phải đúng chính tả, không có gợi ý. Câu bỏ trống tính là sai.</li>
          <li>Hết giờ, hệ thống tự nộp những gì bạn đã làm và vẫn chấm điểm như thường. Nếu bạn bỏ đi không nộp, bài tính 0 điểm và vẫn là một lần làm.</li>
          <li>Làm lúc nào cũng được, không giới hạn số lần, không có thời gian chờ. Chỉ hiện điểm, không có đạt hay trượt.</li>
          <li>Những từ làm sai sẽ được hẹn ôn lại ngay trong lịch ôn.</li>
          <li>Bài kiểm tra không cộng XP trực tiếp. Làm một bài mỗi ngày để hoàn thành nhiệm vụ và nhận thưởng.</li>
        </ul>
      </section>

      {overview.recent.length > 0 ? (
        <section className="sheet sheet-plain stack" aria-labelledby="hs-h">
          <h2 id="hs-h">Điểm gần đây</h2>
          <ol className="board">
            {overview.recent.map((r, i) => (
              <li key={`${r.finishedAt}-${i}`}>
                <span className="who">
                  <b>{pct(r.total)}</b>
                  <span className="muted small">
                    Từ vựng {pct(r.vocab)} · Ngữ pháp {pct(r.grammar)}
                    {r.reading !== null ? ` · Đọc ${pct(r.reading)}` : ""}
                    {r.listening !== null ? ` · Nghe ${pct(r.listening)}` : ""}
                  </span>
                </span>
                <span className="pts small muted">{fmtVnTime(r.finishedAt)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {startError ? <p className="err" role="alert">{startError}</p> : null}

      <div className="row">
        <button type="button" className="btn btn-mark" disabled={!enough || phase.t === "starting"} onClick={() => void start()}>
          {phase.t === "starting" ? "Đang tạo đề…" : overview.hasOpen ? "Tiếp tục bài đang làm" : "Bắt đầu kiểm tra"}
        </button>
        {!enough ? <Link href="/" className="btn btn-light">Vào học thêm</Link> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */

type RunningProps = {
  testId: string;
  items: Question[];
  passages: ClientPassage[];
  expiresAt: number;
  resumed: boolean;
  submitting: boolean;
  onSubmitting: () => void;
  onBackToRun: () => void;
  onResult: (r: PracticeResult) => void;
  onClosed: (message: string) => void;
};

function Running({ testId, items, passages, expiresAt, resumed, submitting, onSubmitting, onBackToRun, onResult, onClosed }: RunningProps) {
  const saved = useMemo(() => readSaved(testId), [testId]);
  const [answers, setAnswers] = useState<Record<string, string>>(saved.answers);
  const [idx, setIdx] = useState(Math.min(saved.idx, items.length - 1));
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sent = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  useEffect(() => {
    try {
      sessionStorage.setItem(storeKey(testId), JSON.stringify({ answers, idx }));
    } catch {
      /* bỏ qua */
    }
  }, [answers, idx, testId]);

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
    const payload = items.map((q) => ({ qid: q.qid, value: (answersRef.current[q.qid] ?? "").trim() })).filter((a) => a.value !== "");
    try {
      onResult(await apiPost<PracticeResult>("/api/test/submit", { testId, answers: payload }));
    } catch (e) {
      if (e instanceof ApiFail && e.code === "TEST_INVALID") {
        onClosed("Bài này đã kết thúc hoặc không còn hiệu lực (có thể đã bị đóng vì quá giờ khi bạn mở bài mới).");
        return;
      }
      sent.current = false;
      setError(errorMessage(e));
      onBackToRun();
    }
  }, [testId, items, onBackToRun, onClosed, onResult, onSubmitting]);

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
          <b>Bài kiểm tra</b>
          <span className={`timer${low ? " low" : ""}`} role="timer" aria-label={`Còn ${fmtClock(remaining)}`}>⏱ {fmtClock(remaining)}</span>
        </div>
        <div className="spread small">
          <span>Câu {idx + 1}/{items.length}</span>
          <span className="muted">Đã trả lời {answered}/{items.length}</span>
        </div>
        <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={answered} aria-label="Số câu đã trả lời">
          <i style={{ width: `${(answered / items.length) * 100}%` }} />
        </div>
      </div>

      {resumed ? <p className="gate">Bạn đang có bài dở nên hệ thống mở lại đúng bài đó.</p> : null}
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
              <button type="button" className="btn btn-red" disabled={submitting} onClick={() => void submit()}>{submitting ? "Đang chấm bài…" : "Nộp bài"}</button>
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

function ResultView({ result, onAgain }: { result: PracticeResult; onAgain: () => void }) {
  const total = Math.round(result.scoreTotal * 100);
  const diff = result.previousTotal === null ? null : total - Math.round(result.previousTotal * 100);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="sheet" aria-labelledby="res-h">
        <div className="grade">
          <h1 id="res-h" style={{ fontSize: 14, fontWeight: 600, color: "var(--pencil)" }}>Kết quả bài kiểm tra</h1>
          <div className="score" aria-label={`Điểm tổng ${total} phần trăm`}>{total}%</div>
          {diff !== null ? (
            <p className="muted">{diff === 0 ? "Bằng điểm bài trước." : diff > 0 ? `Cao hơn bài trước ${diff} điểm.` : `Thấp hơn bài trước ${-diff} điểm.`}</p>
          ) : (
            <p className="muted">Đây là bài kiểm tra đầu tiên của bạn.</p>
          )}
        </div>
        <div className="parts">
          <div className="part">
            <b>{pct(result.scoreVocab)}</b>
            <span className="muted small">Từ vựng ({result.vocabCount} câu)</span>
          </div>
          <div className="part">
            <b>{pct(result.scoreGrammar)}</b>
            <span className="muted small">Ngữ pháp ({result.grammarCount} câu)</span>
          </div>
          {result.scoreReading !== null ? (
            <div className="part">
              <b>{pct(result.scoreReading)}</b>
              <span className="muted small">Bài đọc ({result.readingCount} câu)</span>
            </div>
          ) : null}
          {result.scoreListening !== null ? (
            <div className="part">
              <b>{pct(result.scoreListening)}</b>
              <span className="muted small">Bài nghe ({result.listeningCount} câu)</span>
            </div>
          ) : null}
        </div>
        {result.questCounted ? <p className="gate gate-ok" style={{ marginTop: 12 }}>Đã tính vào nhiệm vụ hôm nay. Vào tab Nhiệm vụ để nhận thưởng.</p> : (
          <p className="gate" style={{ marginTop: 12 }}>Bạn trả lời chưa đủ một nửa số câu nên bài này chưa tính vào nhiệm vụ.</p>
        )}
        {result.scheduledReview > 0 ? <p className="muted small" style={{ marginTop: 12 }}>{result.scheduledReview} từ làm sai đã được hẹn ôn lại ngay.</p> : null}
      </section>

      <div className="row">
        <button type="button" className="btn btn-mark" onClick={onAgain}>Làm bài khác</button>
        <Link href="/quests" className="btn btn-light">Nhiệm vụ</Link>
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
                <p>Đáp án đúng: <span className="ok">{asText(r.expected)}</span></p>
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
