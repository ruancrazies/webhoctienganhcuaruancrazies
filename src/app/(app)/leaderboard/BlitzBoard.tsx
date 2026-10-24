"use client";

import { useEffect, useState } from "react";
import { apiGet, errorMessage } from "@/lib/api";
import { fmtNumber } from "@/lib/format";
import type { Cefr } from "@/core/types";
import type { BlitzBoardResponse } from "@/types/api";

const LEVELS: Cefr[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** Top 5 điểm Đua tốc độ theo cấp (tải khi đổi cấp). */
export function BlitzBoard() {
  const [cefr, setCefr] = useState<Cefr>("A1");
  const [data, setData] = useState<BlitzBoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    apiGet<BlitzBoardResponse>(`/api/leaderboard?blitz=${cefr}`)
      .then((r) => !cancelled && setData(r))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [cefr]);

  return (
    <section className="sheet" aria-labelledby="bz-h">
      <div className="stack">
        <div className="stack" style={{ gap: 2 }}>
          <h2 id="bz-h">⚡ Đua tốc độ</h2>
          <p className="muted small">Điểm cao nhất theo từng cấp, top 5.</p>
        </div>
        <div className="scope" role="group" aria-label="Chọn cấp">
          {LEVELS.map((l) => (
            <button key={l} type="button" className="pill" aria-pressed={cefr === l} onClick={() => setCefr(l)}>
              {l}
            </button>
          ))}
        </div>

        {error ? (
          <p className="err" role="alert">{error}</p>
        ) : !data ? (
          <div className="skeleton" style={{ height: 120 }} aria-busy="true" aria-label="Đang tải" />
        ) : data.rows.length === 0 ? (
          <p className="muted">Chưa có ai chơi Đua tốc độ ở cấp {cefr}.</p>
        ) : (
          <ol className="board">
            {data.rows.map((r, i) => (
              <li key={`${r.username}-${i}`}>
                <span className={`rank${i < 3 ? ` r${i + 1}` : ""}`}>{i + 1}</span>
                <span className="who"><b>{r.username}</b></span>
                <span className="pts">{fmtNumber(r.best)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
