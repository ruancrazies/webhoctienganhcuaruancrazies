"use client";

import { Fragment } from "react";
import { StepGame } from "./shell/StepGame";
import type { GameProps } from "./shell/types";

/** Đúng hay sai: câu ngữ pháp đã điền sẵn đáp án. Đáp án gửi lên là "true" / "false". */
export function TfGame(props: GameProps) {
  return (
    <StepGame
      {...props}
      autoAdvance
      render={({ q, value, setValue, disabled }) => (
        <div className="qcard">
          <p className="q-kind">Câu này đúng hay sai về ngữ pháp?</p>
          <p className="q-prompt sentence">
            {q.prompt.split("___").map((p, i, arr) => (
              <Fragment key={i}>
                {p}
                {i < arr.length - 1 ? <span className="blank" /> : null}
              </Fragment>
            ))}
          </p>
          <div className="tf-btns" role="group" aria-label="Chọn đúng hoặc sai">
            <button type="button" className="tf-btn tf-yes" aria-pressed={value === "true"} disabled={disabled} onClick={() => setValue("true")}>
              <span aria-hidden="true">✓</span> Đúng
            </button>
            <button type="button" className="tf-btn tf-no" aria-pressed={value === "false"} disabled={disabled} onClick={() => setValue("false")}>
              <span aria-hidden="true">✗</span> Sai
            </button>
          </div>
        </div>
      )}
    />
  );
}
