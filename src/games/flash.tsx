"use client";

import { useEffect, useRef, useState } from "react";
import { sfx, speak } from "@/lib/sound";
import type { Answer } from "@/core/types";
import type { GameProps } from "./shell/types";

type Slot = { i: number; pass: 1 | 2 };

/**
 * Thẻ ghi nhớ: lật thẻ rồi tự đánh giá. Server không chấm trò này, chỉ ghi nhận số thẻ hoàn thành.
 * "Chưa nhớ" đưa thẻ xuống cuối để gặp lại đúng một lần nữa; sau lần thứ hai thẻ coi như xong.
 */
export function FlashGame({ items, onFinish }: GameProps) {
  const [queue, setQueue] = useState<Slot[]>(() => items.map((_, i) => ({ i, pass: 1 })));
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const results = useRef<Record<string, "known" | "again">>({});
  const finished = useRef(false);
  const cur = queue[0];
  const item = cur ? items[cur.i] : undefined;

  // tự đọc từ khi thẻ mới hiện (tôn trọng nút tắt âm)
  const spoken = item ? `${item.qid}:${cur.pass}` : "";
  useEffect(() => {
    if (!item) return;
    const t = setTimeout(() => speak(item.prompt), 200);
    return () => clearTimeout(t);
  }, [spoken]);

  const rate = (known: boolean) => {
    if (!cur || !item || finished.current) return;
    setFlipped(false);
    sfx(known ? "correct" : "tap");

    if (!known && cur.pass === 1) {
      setQueue((q) => [...q.slice(1), { i: cur.i, pass: 2 }]);
      return;
    }
    results.current[item.qid] = known ? "known" : "again";
    setDone((d) => d + 1);
    if (queue.length <= 1) {
      finished.current = true;
      const answers: Answer[] = items.map((it) => ({ qid: it.qid, value: results.current[it.qid] ?? "again" }));
      onFinish(answers);
      return;
    }
    setQueue((q) => q.slice(1));
  };

  // phím tắt: ← chưa nhớ, → đã nhớ (sau khi lật)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!flipped || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "ArrowLeft") rate(false);
      else if (e.key === "ArrowRight") rate(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!item) return null;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="stack" style={{ gap: 6 }}>
        <div className="spread small">
          <span>Đã xong {done}/{items.length} thẻ</span>
          {cur.pass === 2 ? <span className="chip chip-warn">Gặp lại</span> : null}
        </div>
        <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done} aria-label="Số thẻ đã xong">
          <i style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      </div>

      <section className="sheet sheet-plain stack" aria-live="polite">
        <button
          key={`${item.qid}:${cur.pass}`}
          type="button"
          className={`fc${flipped ? " back" : ""}`}
          autoFocus
          onClick={() => {
            sfx("tap");
            setFlipped((f) => !f);
          }}
          aria-label={flipped ? `Nghĩa: ${item.back}. Bấm để lật lại` : `Từ: ${item.prompt}. Bấm để xem nghĩa`}
        >
          <span className="fc-side">{flipped ? "Nghĩa tiếng Việt" : "Từ tiếng Anh"}</span>
          <span className="fc-main">{flipped ? item.back : item.prompt}</span>
          <span className="fc-tip">{flipped ? item.prompt : "Bấm để lật thẻ"}</span>
        </button>

        <div className="row" style={{ justifyContent: "center" }}>
          <button type="button" className="btn btn-light btn-sm" onClick={() => speak(item.prompt, { force: true })}>
            🔊 Nghe
          </button>
        </div>

        {flipped ? (
          <div className="fc-rate">
            <button type="button" className="btn btn-red" onClick={() => rate(false)}>
              ✗ Chưa nhớ
            </button>
            <button type="button" className="btn" style={{ background: "var(--good)", borderColor: "var(--good)", boxShadow: "0 3px 0 #0f5c3c" }} onClick={() => rate(true)}>
              ✓ Đã nhớ
            </button>
          </div>
        ) : (
          <p className="muted small" style={{ textAlign: "center" }}>Nhớ nghĩa của từ trước, rồi lật thẻ để kiểm tra.</p>
        )}
      </section>
    </div>
  );
}
