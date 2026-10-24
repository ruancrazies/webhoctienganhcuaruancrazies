"use client";

import { QuestionCard } from "@/components/QuestionCard";
import { StepGame } from "./shell/StepGame";
import type { GameProps } from "./shell/types";

/**
 * Điền vào câu. Câu có `options` là dạng chọn (tự sang câu tiếp), không có là dạng gõ (có "Chưa biết").
 * QuestionCard đã lo cả hai dạng và phần câu chứa chỗ trống.
 */
export function ClozeGame(props: GameProps) {
  const hasOptions = (q: { options?: string[] }) => !!q.options?.length;
  return (
    <StepGame
      {...props}
      autoAdvance={hasOptions}
      allowDontKnow={(q) => !hasOptions(q)}
      render={({ q, value, setValue, submit, disabled }) => (
        <QuestionCard q={q} value={value as string} onChange={setValue} onEnter={submit} disabled={disabled} />
      )}
    />
  );
}
