"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { shuffle } from "@/core/questions";
import { sfx, speak } from "@/lib/sound";
import type { Answer, Question } from "@/core/types";
import type { GameProps } from "./shell/types";

const BATCH = 5; // số cặp mỗi màn (vừa màn hình điện thoại)

const chunk = <T,>(arr: T[], n: number): T[][] => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/**
 * Ghép cặp: nối từ tiếng Anh (cột trái) với nghĩa tiếng Việt (cột phải). Trình duyệt có cả hai mặt (`back`)
 * nên báo đúng/sai ngay; server chỉ ghi nhận các cặp đã hoàn thành. So khớp theo nghĩa, nên hai từ cùng nghĩa không bị bắt lỗi oan.
 */
export function MatchGame({ items, onFinish }: GameProps) {
  const batches = useMemo(() => chunk(items, BATCH), [items]);
  const [viOrder] = useState<Question[][]>(() => batches.map((b) => shuffle(b)));
  const [bi, setBi] = useState(0);
  const [matchedEn, setMatchedEn] = useState<ReadonlySet<string>>(new Set());
  const [matchedVi, setMatchedVi] = useState<ReadonlySet<string>>(new Set());
  const [selEn, setSelEn] = useState<string | null>(null);
  const [selVi, setSelVi] = useState<string | null>(null);
  const [bad, setBad] = useState<{ en: string; vi: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const attempts = useRef<Record<string, number>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const finished = useRef(false);
  const byId = useMemo(() => new Map(items.map((it) => [it.qid, it])), [items]);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const batch = batches[bi] ?? [];

  const resolve = (en: string, vi: string) => {
    const a = byId.get(en);
    const b = byId.get(vi);
    if (!a || !b) return;
    setBusy(true);

    if (a.back === b.back) {
      sfx("correct");
      speak(a.prompt);
      const nextEn = new Set(matchedEn).add(en);
      setMatchedEn(nextEn);
      setMatchedVi(new Set(matchedVi).add(vi));
      setSelEn(null);
      setSelVi(null);

      if (batch.every((it) => nextEn.has(it.qid))) {
        later(() => {
          if (bi >= batches.length - 1) {
            if (finished.current) return;
            finished.current = true;
            const answers: Answer[] = items.map((it) => ({ qid: it.qid, value: "ok", attempts: attempts.current[it.qid] ?? 0 }));
            onFinish(answers);
          } else {
            setBi(bi + 1);
            setBusy(false);
          }
        }, 650);
      } else {
        setBusy(false);
      }
    } else {
      sfx("wrong");
      attempts.current[en] = (attempts.current[en] ?? 0) + 1;
      setBad({ en, vi });
      later(() => {
        setBad(null);
        setSelEn(null);
        setSelVi(null);
        setBusy(false);
      }, 550);
    }
  };

  const tapEn = (id: string) => {
    if (busy || matchedEn.has(id)) return;
    sfx("tap");
    if (selEn === id) return setSelEn(null);
    setSelEn(id);
    if (selVi) resolve(id, selVi);
  };
  const tapVi = (id: string) => {
    if (busy || matchedVi.has(id)) return;
    sfx("tap");
    if (selVi === id) return setSelVi(null);
    setSelVi(id);
    if (selEn) resolve(selEn, id);
  };

  const cls = (base: string, id: string, matched: ReadonlySet<string>, sel: string | null, badId: string | undefined) =>
    `mt-tile${matched.has(id) ? " ok" : ""}${sel === id ? " sel" : ""}${badId === id ? " bad" : ""}${base ? ` ${base}` : ""}`;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="stack" style={{ gap: 6 }}>
        <div className="spread small">
          <span>Đã ghép {matchedEn.size}/{items.length} cặp</span>
          {batches.length > 1 ? <span className="muted">Màn {bi + 1}/{batches.length}</span> : null}
        </div>
        <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={matchedEn.size} aria-label="Số cặp đã ghép">
          <i style={{ width: `${(matchedEn.size / items.length) * 100}%` }} />
        </div>
      </div>

      <section className="sheet" aria-live="polite">
        <p className="q-kind" style={{ marginBottom: 12 }}>Chọn một từ tiếng Anh rồi chọn nghĩa tiếng Việt của nó</p>
        <div className="mt-grid">
          <div className="mt-col" role="group" aria-label="Từ tiếng Anh">
            {batch.map((it) => (
              <button key={it.qid} type="button" className={cls("", it.qid, matchedEn, selEn, bad?.en)} disabled={matchedEn.has(it.qid)} aria-pressed={selEn === it.qid} onClick={() => tapEn(it.qid)}>
                {it.prompt}
              </button>
            ))}
          </div>
          <div className="mt-col" role="group" aria-label="Nghĩa tiếng Việt">
            {(viOrder[bi] ?? []).map((it) => (
              <button key={it.qid} type="button" className={cls("", it.qid, matchedVi, selVi, bad?.vi)} disabled={matchedVi.has(it.qid)} aria-pressed={selVi === it.qid} onClick={() => tapVi(it.qid)}>
                {it.back}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
