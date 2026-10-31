"use client";

import { useState } from "react";
import { apiPost, errorMessage } from "@/lib/api";
import type { ExplainResponse } from "@/types/api";

/** Nút "Giải thích vì sao sai" cho một câu sai trong bài đã nộp (giai đoạn 3). Giải thích do AI viết nên có nhãn và có thể nhầm. */
export function ExplainButton({ type, id, qid }: { type: "exam" | "practice"; id: string; qid: string }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ExplainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      setRes(await apiPost<ExplainResponse>("/api/results/explain", { type, id, qid }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (res) {
    return (
      <p className="explain small" role="status">
        <b>Giải thích:</b> {res.text}
        {res.source !== "rule" ? <span className="muted"> (AI viết, có thể nhầm)</span> : null}
      </p>
    );
  }
  return (
    <div className="explain-ask">
      <button type="button" className="btn btn-sm btn-light" disabled={busy} onClick={() => void ask()}>
        {busy ? "Đang giải thích…" : "Giải thích vì sao sai"}
      </button>
      {error ? <p className="err small" role="alert">{error}</p> : null}
    </div>
  );
}
