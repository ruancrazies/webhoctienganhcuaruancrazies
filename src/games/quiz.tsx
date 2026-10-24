"use client";

import { QuestionCard } from "@/components/QuestionCard";
import { StepGame } from "./shell/StepGame";
import type { GameProps } from "./shell/types";

/** Trắc nghiệm: chọn nghĩa tiếng Việt đúng. Chọn xong tự sang câu tiếp. */
export function QuizGame(props: GameProps) {
  return (
    <StepGame
      {...props}
      autoAdvance
      render={({ q, value, setValue, disabled }) => <QuestionCard q={q} value={value as string} onChange={setValue} disabled={disabled} />}
    />
  );
}
