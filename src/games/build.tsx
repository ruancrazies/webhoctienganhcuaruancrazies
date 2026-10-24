"use client";

import { useCallback, useState } from "react";
import { speak, sfx } from "@/lib/sound";
import type { Question } from "@/core/types";
import { StepGame, type StepValue } from "./shell/StepGame";
import type { GameProps } from "./shell/types";

/** Xếp câu: bấm từ ở dưới để đưa lên câu, bấm từ trong câu để bỏ ra. Chỉ số theo vị trí nên từ trùng nhau không bị lẫn. */
function BuildBoard({ q, onChange, disabled }: { q: Question; onChange: (v: string[]) => void; disabled: boolean }) {
  const tokens = q.tokens ?? [];
  const [placed, setPlaced] = useState<number[]>([]);

  const update = useCallback(
    (next: number[]) => {
      setPlaced(next);
      onChange(next.map((i) => tokens[i]));
    },
    [onChange, tokens],
  );

  const full = placed.length === tokens.length && tokens.length > 0;

  return (
    <div className="qcard">
      <p className="q-kind">Sắp xếp các từ thành câu tiếng Anh đúng:</p>
      <p className="q-prompt sentence">{q.prompt}</p>

      <div className={`sentence-line${placed.length === 0 ? " empty" : ""}`} role="group" aria-label="Câu của bạn">
        {placed.length === 0 ? (
          <span className="muted">Bấm các từ bên dưới để xếp câu</span>
        ) : (
          placed.map((idx, pos) => (
            <button
              key={`${idx}-${pos}`}
              type="button"
              className="wtile on"
              disabled={disabled}
              aria-label={`${tokens[idx]}, bấm để bỏ ra`}
              onClick={() => update(placed.filter((_, p) => p !== pos))}
            >
              {tokens[idx]}
            </button>
          ))
        )}
      </div>

      <div className="bank" role="group" aria-label="Các từ">
        {tokens.map((t, i) => (
          <button
            key={i}
            type="button"
            className="wtile"
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
          ⌫ Xóa từ cuối
        </button>
        <button type="button" className="btn btn-light btn-sm" disabled={disabled || placed.length === 0} onClick={() => update([])}>
          Xóa hết
        </button>
        {full ? (
          <button type="button" className="icon-btn" aria-label="Nghe câu của bạn" onClick={() => speak(placed.map((i) => tokens[i]).join(" "), { force: true })}>
            🔊
          </button>
        ) : null}
      </div>
    </div>
  );
}

const ready = (q: Question, v: StepValue) => Array.isArray(v) && v.length === (q.tokens?.length ?? -1);

/** Xếp câu: đáp án gửi lên là mảng các từ theo thứ tự đã xếp. */
export function BuildGame(props: GameProps) {
  return (
    <StepGame
      {...props}
      multi
      isReady={ready}
      allowDontKnow
      render={({ q, setValue, disabled }) => <BuildBoard q={q} onChange={(v) => setValue(v)} disabled={disabled} />}
    />
  );
}
