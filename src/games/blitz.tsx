"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QuestionCard } from "@/components/QuestionCard";
import { fmtClock } from "@/lib/format";
import { sfx } from "@/lib/sound";
import type { Answer } from "@/core/types";
import type { GameProps } from "./shell/types";

export const BLITZ_SECONDS = 60;

/**
 * Đua tốc độ: 60 giây, chọn nghĩa càng nhiều càng tốt, chọn là sang câu ngay.
 * Combo, mạng và điểm do SERVER tính khi nộp (trình duyệt không biết đáp án đúng), nên ở đây chỉ đếm số câu đã trả lời.
 */
export function BlitzGame({ items, onFinish }: GameProps) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string>("");
  const [left, setLeft] = useState(BLITZ_SECONDS);
  const answers = useRef<Answer[]>([]);
  const endsAt = useRef(Date.now() + BLITZ_SECONDS * 1000);
  const finished = useRef(false);
  const pending = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onFinish(answers.current);
  }, [onFinish]);

  useEffect(() => {
    const id = setInterval(() => {
      const s = Math.max(0, Math.ceil((endsAt.current - Date.now()) / 1000));
      setLeft(s);
      if (s <= 0) finish();
    }, 200);
    return () => clearInterval(id);
  }, [finish]);

  const q = items[idx];

  const pick = useCallback(
    (value: string) => {
      if (finished.current || pending.current || value === "") return;
      pending.current = true;
      setPicked(value);
      sfx("tap");
      answers.current.push({ qid: items[idx].qid, value });
      setTimeout(() => {
        pending.current = false;
        if (finished.current) return;
        if (idx + 1 >= items.length) finish();
        else {
          setIdx(idx + 1);
          setPicked("");
        }
      }, 220);
    },
    [finish, idx, items],
  );

  // phím 1–4 chọn đáp án
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || !/^[1-9]$/.test(e.key)) return;
      const o = items[idx]?.options?.[Number(e.key) - 1];
      if (o !== undefined) pick(o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, items, pick]);

  const low = left <= 10;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="exam-head" style={{ position: "static" }}>
        <div className="spread">
          <b>⚡ Đua tốc độ</b>
          <span className={`timer${low ? " low" : ""}`} role="timer" aria-label={`Còn ${fmtClock(left)}`}>
            ⏱ {fmtClock(left)}
          </span>
        </div>
        <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={BLITZ_SECONDS} aria-valuenow={left} aria-label="Thời gian còn lại">
          <i style={{ width: `${(left / BLITZ_SECONDS) * 100}%`, transition: "width 0.2s linear" }} />
        </div>
        <div className="spread small">
          <span>Đã trả lời <b>{answers.current.length}</b> câu</span>
          <span className="muted">Điểm, combo và mạng được tính khi hết giờ</span>
        </div>
      </div>

      <section className="sheet" aria-live="polite">
        <QuestionCard key={q.qid} q={q} value={picked} onChange={pick} disabled={picked !== ""} />
      </section>
    </div>
  );
}
