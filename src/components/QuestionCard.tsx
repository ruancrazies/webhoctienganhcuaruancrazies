"use client";

import { Fragment, useEffect, useRef } from "react";
import { speak } from "@/lib/sound";
import type { Question } from "@/core/types";

const KIND: Record<string, string> = {
  quiz: "Chọn nghĩa tiếng Việt của từ",
  blitz: "Chọn nghĩa tiếng Việt của từ",
  listen: "Nghe và chọn nghĩa đúng",
  type: "Gõ từ tiếng Anh có nghĩa sau",
  cloze: "Điền từ còn thiếu vào câu",
  grammar: "Chọn đáp án đúng",
  scramble: "Sắp xếp các chữ cái",
  build: "Sắp xếp các từ thành câu",
  tf: "Câu này đúng hay sai?",
};

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** Câu có chỗ trống "___" → gạch đỏ. */
function Sentence({ text }: { text: string }) {
  const parts = text.split("___");
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {p}
          {i < parts.length - 1 ? <span className="blank" aria-label="chỗ trống" /> : null}
        </Fragment>
      ))}
    </>
  );
}

type Props = {
  q: Question;
  value: string;
  onChange: (v: string) => void;
  /** Nhấn Enter ở ô gõ. */
  onEnter?: () => void;
  disabled?: boolean;
};

/**
 * Hiển thị MỘT câu hỏi dạng chọn đáp án hoặc gõ chữ (quiz, cloze, type, grammar…) và trả giá trị qua onChange.
 * Không biết đúng/sai (server chấm); bài thi dùng trực tiếp, các trò quiz/type/cloze sẽ dùng lại.
 */
export function QuestionCard({ q, value, onChange, onEnter, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasOptions = !!q.options?.length;
  const isSentence = q.game === "cloze" || q.game === "grammar" || q.prompt.includes("___") || q.prompt.length > 28;
  const canSpeak = q.game === "quiz" || q.game === "blitz" || q.game === "listen";

  useEffect(() => {
    if (!hasOptions) inputRef.current?.focus();
  }, [q.qid, hasOptions]);

  return (
    <div className="qcard">
      <p className="q-kind">{KIND[q.game] ?? "Trả lời câu hỏi"}</p>

      <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
        <p className={`q-prompt${isSentence ? " sentence" : ""}`} style={{ flex: 1 }}>
          {q.game === "listen" ? "🎧 Bấm nút loa để nghe" : <Sentence text={q.prompt} />}
        </p>
        {canSpeak ? (
          <button type="button" className="icon-btn" onClick={() => speak(q.prompt, { force: true })} aria-label={`Nghe phát âm ${q.prompt}`}>
            🔊
          </button>
        ) : null}
      </div>

      {q.hint && q.game !== "type" ? <p className="q-hint">Gợi ý: {q.hint}</p> : null}
      {q.hint && q.game === "type" ? <p className="q-hint">Gợi ý: <b>{q.hint}</b></p> : null}

      {hasOptions ? (
        <div className={`opts${q.options!.every((o) => o.length <= 22) ? " two" : ""}`} role="group" aria-label="Các đáp án">
          {q.options!.map((o, i) => (
            <button key={`${i}-${o}`} type="button" className="opt" aria-pressed={value === o} disabled={disabled} onClick={() => onChange(value === o ? "" : o)}>
              <span className="k" aria-hidden="true">{LETTERS[i] ?? i + 1}</span>
              {o}
            </button>
          ))}
        </div>
      ) : (
        <input
          ref={inputRef}
          className="text-in"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter?.();
            }
          }}
          placeholder="Gõ đáp án…"
          aria-label="Đáp án của bạn"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={100}
        />
      )}
    </div>
  );
}

