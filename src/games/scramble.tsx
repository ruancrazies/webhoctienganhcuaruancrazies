"use client";

import { useCallback, useEffect, useState } from "react";
import { sfx } from "@/lib/sound";
import type { Question } from "@/core/types";
import { StepGame, type StepValue } from "./shell/StepGame";
import type { GameProps } from "./shell/types";

const isTextTarget = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

/** Bảng xếp chữ: bấm chữ ở dưới để đặt lên, bấm chữ đã đặt để bỏ ra. Trên máy tính gõ phím để đặt, Backspace để xóa. */
function ScrambleBoard({ q, onChange, disabled }: { q: Question; onChange: (v: string) => void; disabled: boolean }) {
  const tokens = q.tokens ?? [];
  const [placed, setPlaced] = useState<number[]>([]);

  const update = useCallback(
    (next: number[]) => {
      setPlaced(next);
      onChange(next.map((i) => tokens[i]).join(""));
    },
    [onChange, tokens],
  );

  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTextTarget(e.target)) return;
      if (e.key === "Backspace") {
        e.preventDefault();
        if (placed.length) update(placed.slice(0, -1));
        return;
      }
      if (e.key.length !== 1) return;
      const want = e.key.toLowerCase();
      const i = tokens.findIndex((t, k) => !placed.includes(k) && t.toLowerCase() === want);
      if (i >= 0) {
        sfx("tap");
        update([...placed, i]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, placed, tokens, update]);

  return (
    <div className="qcard">
      <p className="q-kind">Sắp xếp các chữ cái thành từ tiếng Anh có nghĩa:</p>
      <p className="q-prompt">{q.prompt}</p>
      <p className="q-hint">Có {tokens.length} chữ cái</p>

      <div className="slots" role="group" aria-label="Các chữ đã đặt">
        {tokens.map((_, pos) => {
          const idx = placed[pos];
          return idx === undefined ? (
            <span key={pos} className="slot" aria-label="ô trống" />
          ) : (
            <button
              key={pos}
              type="button"
              className="slot filled"
              disabled={disabled}
              aria-label={`Chữ ${tokens[idx]}, bấm để bỏ ra`}
              onClick={() => update(placed.filter((_, p) => p !== pos))}
            >
              {tokens[idx]}
            </button>
          );
        })}
      </div>

      <div className="tiles" role="group" aria-label="Các chữ cái">
        {tokens.map((t, i) => (
          <button
            key={i}
            type="button"
            className="tile"
            disabled={disabled || placed.includes(i)}
            onClick={() => {
              sfx("tap");
              update([...placed, i]);
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="row">
        <button type="button" className="btn btn-light btn-sm" disabled={disabled || placed.length === 0} onClick={() => update(placed.slice(0, -1))}>
          ⌫ Xóa chữ cuối
        </button>
        <button type="button" className="btn btn-light btn-sm" disabled={disabled || placed.length === 0} onClick={() => update([])}>
          Xóa hết
        </button>
      </div>
    </div>
  );
}

const ready = (q: Question, v: StepValue) => typeof v === "string" && [...v].length === (q.tokens?.length ?? -1);

/** Xếp chữ cái: đáp án gửi lên là chuỗi các chữ đã xếp (server bỏ khoảng trắng khi so khớp). */
export function ScrambleGame(props: GameProps) {
  return (
    <StepGame
      {...props}
      isReady={ready}
      allowDontKnow
      render={({ q, setValue, disabled }) => <ScrambleBoard q={q} onChange={setValue} disabled={disabled} />}
    />
  );
}
