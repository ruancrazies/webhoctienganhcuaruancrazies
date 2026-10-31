"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { sfx } from "@/lib/sound";
import { useDwell } from "@/lib/useDwell";
import type { Answer, Question } from "@/core/types";
import { DONT_KNOW, type GameProps } from "./types";

export type StepValue = string | string[];

export type StepRenderArgs = {
  q: Question;
  value: StepValue;
  setValue: (v: StepValue) => void;
  /** Sang câu tiếp (Enter…). Không làm gì nếu câu chưa sẵn sàng. */
  submit: () => void;
  disabled: boolean;
};

type Flag = boolean | ((q: Question) => boolean);
const flag = (f: Flag | undefined, q: Question) => (typeof f === "function" ? f(q) : !!f);

type Props = GameProps & {
  render: (a: StepRenderArgs) => ReactNode;
  /** Giá trị là mảng (xếp câu) thay vì chuỗi. */
  multi?: boolean;
  /** Câu đã có đáp án hợp lệ để sang câu tiếp chưa. Mặc định: không rỗng. */
  isReady?: (q: Question, v: StepValue) => boolean;
  /** Chọn xong là tự sang câu tiếp (trắc nghiệm, đúng/sai). */
  autoAdvance?: Flag;
  /** Hiện nút "Chưa biết". */
  allowDontKnow?: Flag;
};

const nonEmpty = (v: StepValue) => (Array.isArray(v) ? v.length > 0 : v.trim() !== "");
const isTextTarget = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

/**
 * Khung cho các trò làm LẦN LƯỢT từng câu (quiz, type, cloze, listen, scramble, build, tf).
 * Giữ chỉ số câu, thanh tiến độ, nút Tiếp/Chưa biết, phím tắt; phần nhập liệu do `render` của từng trò vẽ.
 * Trình duyệt không biết đáp án đúng (server chấm) nên không có phản hồi đúng/sai từng câu; xem kết quả ở màn cuối.
 */
export function StepGame({ items, onFinish, render, multi, isReady, autoAdvance, allowDontKnow }: Props) {
  const empty = useCallback((): StepValue => (multi ? [] : ""), [multi]);
  const [idx, setIdx] = useState(0);
  const [value, setValueState] = useState<StepValue>(empty);
  const [advancing, setAdvancing] = useState(false);

  const idxRef = useRef(0);
  const doneRef = useRef(false);
  const advancingRef = useRef(false);
  const answers = useRef<Answer[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const valueRef = useRef<StepValue>(value);
  valueRef.current = value;

  // responseMs: thời gian câu hiện trên màn hình. Trò tự chuyển câu (trắc nghiệm) chốt ngay lúc chọn,
  // không tính 320 ms hiệu ứng chờ; trò gõ/ghép chốt lúc bấm Tiếp/Enter.
  const dwell = useDwell();
  const pickedMs = useRef<number | undefined>(undefined);

  const q = items[idx];
  useEffect(() => {
    dwell.show(q.qid);
  }, [dwell, q.qid]);
  const ready = isReady ? isReady(q, value) : nonEmpty(value);
  const last = idx >= items.length - 1;

  useEffect(() => () => clearTimeout(timer.current), []);

  const commit = useCallback(
    (v: StepValue) => {
      if (doneRef.current) return;
      const i = idxRef.current;
      const qid = items[i].qid;
      const responseMs = pickedMs.current ?? dwell.ms(qid);
      pickedMs.current = undefined;
      answers.current.push({ qid, value: v, ...(responseMs !== undefined ? { responseMs } : {}) });
      sfx("tap");
      advancingRef.current = false;
      setAdvancing(false);
      if (i >= items.length - 1) {
        doneRef.current = true;
        onFinish(answers.current);
        return;
      }
      idxRef.current = i + 1;
      setIdx(i + 1);
      setValueState(empty());
    },
    [items, onFinish, empty, dwell],
  );

  const setValue = useCallback(
    (v: StepValue) => {
      if (doneRef.current || advancingRef.current) return;
      setValueState(v);
      valueRef.current = v;
      if (flag(autoAdvance, items[idxRef.current]) && nonEmpty(v)) {
        advancingRef.current = true;
        setAdvancing(true);
        sfx("tap");
        pickedMs.current = dwell.ms(items[idxRef.current].qid);
        timer.current = setTimeout(() => commit(v), 320);
      }
    },
    [autoAdvance, commit, items, dwell],
  );

  const submit = useCallback(() => {
    if (doneRef.current || advancingRef.current) return;
    const cur = items[idxRef.current];
    const v = valueRef.current;
    if (isReady ? isReady(cur, v) : nonEmpty(v)) commit(v);
  }, [commit, isReady, items]);

  const dontKnow = () => {
    if (doneRef.current || advancingRef.current) return;
    commit(multi ? [DONT_KNOW] : DONT_KNOW);
  };

  // phím tắt: 1–9 chọn đáp án theo thứ tự; Enter (ngoài ô gõ) = Tiếp
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTextTarget(e.target)) return;
      const cur = items[idxRef.current];
      if (/^[1-9]$/.test(e.key) && cur.options?.length) {
        const o = cur.options[Number(e.key) - 1];
        if (o !== undefined) setValue(o);
      } else if (e.key === "Enter" && !flag(autoAdvance, cur) && !(e.target instanceof HTMLButtonElement)) {
        submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [autoAdvance, items, setValue, submit]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="stack" style={{ gap: 6 }}>
        <div className="spread small">
          <span>Câu {idx + 1}/{items.length}</span>
        </div>
        <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={idx} aria-label="Tiến độ vòng chơi">
          <i style={{ width: `${(idx / items.length) * 100}%` }} />
        </div>
      </div>

      <section className="sheet" aria-live="polite">
        <div key={q.qid}>{render({ q, value, setValue, submit, disabled: advancing })}</div>
      </section>

      <div className="spread">
        {flag(allowDontKnow, q) ? (
          <button type="button" className="btn btn-light" disabled={advancing} onClick={dontKnow}>
            Chưa biết
          </button>
        ) : (
          <span />
        )}
        {flag(autoAdvance, q) ? null : (
          <button type="button" className="btn btn-mark" disabled={!ready || advancing} onClick={submit}>
            {last ? "Hoàn thành" : "Tiếp"}
          </button>
        )}
      </div>
    </div>
  );
}
