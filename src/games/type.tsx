"use client";

import { QuestionCard } from "@/components/QuestionCard";
import { StepGame } from "./shell/StepGame";
import type { GameProps } from "./shell/types";

/** Gõ từ: nhìn nghĩa tiếng Việt (kèm gợi ý chữ cái đầu), gõ từ tiếng Anh. Server chấp nhận sai một ký tự với từ dài. */
export function TypeGame(props: GameProps) {
  return (
    <StepGame
      {...props}
      allowDontKnow
      render={({ q, value, setValue, submit, disabled }) => (
        <QuestionCard q={q} value={value as string} onChange={setValue} onEnter={submit} disabled={disabled} />
      )}
    />
  );
}
