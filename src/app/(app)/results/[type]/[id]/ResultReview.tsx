"use client";

import Link from "next/link";
import { useState } from "react";
import { AnswerList, ScoreSummary, scoreParts } from "@/components/AttemptView";
import { PassageReveal } from "@/components/PassagePanel";
import { filterReviewed, type ReviewFilter } from "@/core/results";
import { playHref } from "@/games/registry";
import { ApiFail, apiPost, errorMessage } from "@/lib/api";
import { PART_LABEL, fmtVnDateTime, pct } from "@/lib/format";
import type { ResultDetail, ScheduleReviewResponse } from "@/types/api";

type Part = keyof typeof PART_LABEL;

/** Gợi ý "Luyện phần yếu": từ vựng và ngữ pháp có trò riêng; bài đọc/nghe chỉ có trong bài kiểm tra. */
function practiceLink(part: Part, cefr: ResultDetail["studyCefr"]): { href: string; label: string } {
  switch (part) {
    case "vocab":
      return { href: playHref("quiz", { cefr, domain: "general" }), label: "Luyện từ vựng" };
    case "grammar":
      return { href: playHref("tf", { cefr, domain: "all" }), label: "Luyện ngữ pháp" };
    case "reading":
      return { href: "/test", label: "Luyện bài đọc (làm bài kiểm tra)" };
    case "listening":
      return { href: "/test", label: "Luyện bài nghe (làm bài kiểm tra)" };
  }
}

export function ResultReview({ detail }: { detail: ResultDetail }) {
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<ScheduleReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isExam = detail.type === "exam";
  const wrong = detail.items.filter((i) => !i.correct).length;
  const shown = filterReviewed(detail.items, filter);
  const counts = Object.fromEntries(detail.parts.map((p) => [p.part, p.total]));

  const schedule = async () => {
    setBusy(true);
    setError(null);
    try {
      setDone(await apiPost<ScheduleReviewResponse>("/api/results/review", { type: detail.type, id: detail.id }));
    } catch (e) {
      setError(e instanceof ApiFail ? e.message : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const weak = detail.weakPart ? practiceLink(detail.weakPart, detail.studyCefr) : null;
  const pills: { v: ReviewFilter; label: string }[] = [
    { v: "all", label: `Tất cả (${detail.items.length})` },
    { v: "wrong", label: `Chỉ câu sai (${wrong})` },
    ...detail.parts.map((p) => ({ v: p.part as ReviewFilter, label: `${PART_LABEL[p.part]} (${p.correct}/${p.total})` })),
  ];

  return (
    <div className="stack" style={{ gap: 20 }}>
      <ScoreSummary
        heading={isExam ? `Bài thi lên cấp ${detail.cefr}` : "Bài kiểm tra"}
        total={detail.scores.total}
        failed={isExam && detail.passed === false}
        verdict={isExam ? (detail.passed ? `Đạt! Đã qua cấp ${detail.cefr}` : "Chưa đạt") : undefined}
        passVerdict={detail.passed === true}
        parts={scoreParts(detail.scores, detail.passMarks ? { passPart: detail.passMarks.part } : { counts })}
        aboveParts={<p className="muted small">Nộp lúc {fmtVnDateTime(detail.finishedAt)}</p>}
      >
        {detail.passMarks ? (
          <p className="muted small" style={{ marginTop: 12 }}>
            Điều kiện đạt: tổng từ {pct(detail.passMarks.total)}, mỗi phần từ {pct(detail.passMarks.part)}.
          </p>
        ) : null}
      </ScoreSummary>

      <section className="sheet sheet-plain stack" aria-label="Việc nên làm tiếp">
        <div className="row">
          {detail.wrongWords > 0 ? (
            <button type="button" className="btn btn-mark" disabled={busy || done !== null} onClick={() => void schedule()}>
              {busy ? "Đang hẹn…" : done ? "Đã hẹn ôn" : `Ôn lại các từ sai (${detail.wrongWords})`}
            </button>
          ) : null}
          {weak ? <Link href={weak.href} className="btn btn-light">{weak.label}</Link> : null}
          {done && done.scheduled > 0 ? <Link href="/" className="btn btn-light">Về trang chủ để ôn</Link> : null}
        </div>
        {done ? (
          <p className={`gate ${done.scheduled > 0 ? "gate-ok" : ""}`} role="status">
            {done.scheduled > 0
              ? `Đã hẹn ôn lại ${done.scheduled} từ ngay bây giờ.`
              : "Không có từ nào cần hẹn thêm: các từ sai hoặc chưa học (chưa có trong lịch ôn), hoặc đã đến hạn ôn sẵn."}
          </p>
        ) : null}
        {error ? <p className="err" role="alert">{error}</p> : null}
        {detail.weakPart ? (
          <p className="muted small">Phần yếu nhất của bài này: {PART_LABEL[detail.weakPart]}.</p>
        ) : (
          <p className="muted small">Bạn làm đúng hết các câu của bài này.</p>
        )}
      </section>

      <PassageReveal passages={detail.passages} />

      <section className="stack" aria-labelledby="rv-h">
        <h2 id="rv-h">Từng câu</h2>
        <div className="row" role="group" aria-label="Lọc câu hỏi">
          {pills.map((p) => (
            <button key={p.v} type="button" className="pill" aria-pressed={filter === p.v} onClick={() => setFilter(p.v)}>{p.label}</button>
          ))}
        </div>
        {shown.length === 0 ? <p className="muted">Không có câu nào trong mục này.</p> : <AnswerList items={shown} labelledBy="rv-h" explain={{ type: detail.type, id: detail.id }} />}
      </section>
    </div>
  );
}
