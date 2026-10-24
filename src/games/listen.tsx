"use client";

import { useEffect } from "react";
import { QuestionCard } from "@/components/QuestionCard";
import { speak } from "@/lib/sound";
import type { Question } from "@/core/types";
import { StepGame } from "./shell/StepGame";
import type { GameProps } from "./shell/types";

type CardProps = { q: Question; value: string; onChange: (v: string) => void; disabled: boolean };

/** Một câu nghe: tự đọc khi hiện câu (nếu chưa tắt âm), có nút nghe lại và nghe chậm. */
function ListenQuestion({ q, value, onChange, disabled }: CardProps) {
  useEffect(() => {
    const t = setTimeout(() => speak(q.prompt), 250);
    return () => clearTimeout(t);
  }, [q.prompt]);

  return (
    <div className="stack">
      <QuestionCard q={q} value={value} onChange={onChange} disabled={disabled} />
      <div>
        <button type="button" className="btn btn-light btn-sm" onClick={() => speak(q.prompt, { force: true, rate: 0.55 })}>
          🐢 Nghe chậm
        </button>
      </div>
    </div>
  );
}

/** Nghe và chọn: trình duyệt đọc từ tiếng Anh, người chơi chọn nghĩa tiếng Việt. */
export function ListenGame(props: GameProps) {
  return (
    <StepGame
      {...props}
      autoAdvance
      render={({ q, value, setValue, disabled }) => <ListenQuestion q={q} value={value as string} onChange={setValue} disabled={disabled} />}
    />
  );
}
