"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ApiFail, apiGet, errorMessage } from "@/lib/api";
import { fmtVnDateTime, pct } from "@/lib/format";
import type { Cefr } from "@/core/types";
import type { ResultListItem, ResultType, ResultsPage } from "@/types/api";

const GATED: Cefr[] = ["A1", "A2", "B1", "B2", "C1"];
const TYPE_FILTERS: { v: ResultType | "all"; label: string }[] = [
  { v: "all", label: "Tất cả" },
  { v: "exam", label: "Thi lên cấp" },
  { v: "practice", label: "Kiểm tra" },
];

const titleOf = (r: ResultListItem) => (r.type === "exam" ? `Thi lên cấp ${r.cefr ?? ""}`.trim() : "Bài kiểm tra");

/** Điểm tổng các bài đã tải, từ cũ đến mới. Chấm đỏ = thi lên cấp, chấm đen = kiểm tra. */
function ScoreChart({ items }: { items: ResultListItem[] }) {
  if (items.length < 2) return null;
  const pts = [...items].reverse(); // items mới nhất trước → vẽ từ cũ đến mới
  const W = 320;
  const H = 90;
  const padX = 10;
  const padY = 10;
  const x = (i: number) => padX + (i * (W - 2 * padX)) / (pts.length - 1);
  const y = (v: number) => padY + (1 - Math.max(0, Math.min(1, v))) * (H - 2 * padY);
  const label = `Điểm tổng ${pts.length} bài gần nhất, từ cũ đến mới: ${pts.map((p) => pct(p.scores.total)).join(", ")}`;
  return (
    <section className="sheet" aria-labelledby="ch-h">
      <h2 id="ch-h" style={{ marginBottom: 8 }}>Điểm theo thời gian</h2>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ width: "100%", height: "auto", display: "block" }}>
        {[0, 0.5, 1].map((g) => (
          <line key={g} x1={padX} x2={W - padX} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeWidth="1" strokeDasharray={g === 0.5 ? "3 3" : undefined} />
        ))}
        <polyline fill="none" stroke="var(--pencil)" strokeWidth="2" points={pts.map((p, i) => `${x(i)},${y(p.scores.total)}`).join(" ")} />
        {pts.map((p, i) => (
          <circle key={p.id} cx={x(i)} cy={y(p.scores.total)} r="4" fill={p.type === "exam" ? "var(--red)" : "var(--ink)"}>
            <title>{`${titleOf(p)} · ${fmtVnDateTime(p.finishedAt)} · ${pct(p.scores.total)}`}</title>
          </circle>
        ))}
      </svg>
      <p className="muted small" style={{ marginTop: 6 }}>Chấm đỏ: thi lên cấp · chấm đen: kiểm tra. Đường kẻ là 0%, 50%, 100%.</p>
    </section>
  );
}

export function ResultsList({ initial }: { initial: ResultsPage }) {
  const [type, setType] = useState<ResultType | "all">("all");
  const [cefr, setCefr] = useState<Cefr | "all">("all");
  const [items, setItems] = useState(initial.items);
  const [next, setNext] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0); // bỏ kết quả của yêu cầu cũ khi người dùng đổi bộ lọc liên tục
  const first = useRef(true);

  const query = (cursor?: string) => {
    const q = new URLSearchParams();
    if (type !== "all") q.set("type", type);
    if (cefr !== "all") q.set("cefr", cefr);
    if (cursor) q.set("cursor", cursor);
    return `/api/results?${q.toString()}`;
  };

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    apiGet<ResultsPage>(query())
      .then((p) => {
        if (mine !== seq.current) return;
        setItems(p.items);
        setNext(p.nextCursor);
      })
      .catch((e) => mine === seq.current && setError(e instanceof ApiFail ? e.message : errorMessage(e)))
      .finally(() => mine === seq.current && setLoading(false));
    // chỉ chạy lại khi đổi bộ lọc; `query` đọc đúng bộ lọc hiện tại
  }, [type, cefr]);

  const more = async () => {
    if (!next || loading) return;
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const p = await apiGet<ResultsPage>(query(next));
      if (mine !== seq.current) return;
      setItems((cur) => [...cur, ...p.items.filter((x) => !cur.some((c) => c.id === x.id))]);
      setNext(p.nextCursor);
    } catch (e) {
      if (mine === seq.current) setError(errorMessage(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  };

  const pickType = (v: ResultType | "all") => {
    setType(v);
    if (v === "practice") setCefr("all"); // bài kiểm tra không có cấp
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="stack" style={{ gap: 8 }}>
        <div className="row" role="group" aria-label="Lọc theo loại bài">
          {TYPE_FILTERS.map((f) => (
            <button key={f.v} type="button" className="pill" aria-pressed={type === f.v} onClick={() => pickType(f.v)}>{f.label}</button>
          ))}
        </div>
        {type !== "practice" ? (
          <div className="row" role="group" aria-label="Lọc theo cấp (thi lên cấp)">
            <button type="button" className="pill" aria-pressed={cefr === "all"} onClick={() => setCefr("all")}>Mọi cấp</button>
            {GATED.map((c) => (
              <button key={c} type="button" className="pill" aria-pressed={cefr === c} onClick={() => setCefr(c)}>{c}</button>
            ))}
          </div>
        ) : null}
      </div>

      {error ? <p className="err" role="alert">{error}</p> : null}

      <ScoreChart items={items} />

      {items.length === 0 ? (
        <div className="sheet sheet-plain state">
          <div className="big" aria-hidden="true">📝</div>
          <p className="muted">{loading ? "Đang tải…" : type === "all" && cefr === "all" ? "Bạn chưa nộp bài kiểm tra nào." : "Không có bài nào khớp bộ lọc."}</p>
          {type === "all" && cefr === "all" && !loading ? <Link href="/test" className="btn">Làm bài kiểm tra</Link> : null}
        </div>
      ) : (
        <ul className="results-list" aria-busy={loading}>
          {items.map((r) => (
            <li key={`${r.type}:${r.id}`} className="sheet sheet-plain results-row">
              <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                <b>{titleOf(r)}</b>
                <span className="muted small">{fmtVnDateTime(r.finishedAt)}</span>
                <span className="muted small">
                  Từ vựng {pct(r.scores.vocab)} · Ngữ pháp {pct(r.scores.grammar)}
                  {r.scores.reading !== null ? ` · Đọc ${pct(r.scores.reading)}` : ""}
                  {r.scores.listening !== null ? ` · Nghe ${pct(r.scores.listening)}` : ""}
                </span>
              </div>
              <div className="stack" style={{ gap: 6, justifyItems: "end" }}>
                <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                  {r.passed !== null ? <span className={`chip ${r.passed ? "chip-good" : "chip-red"}`}>{r.passed ? "Đạt" : "Trượt"}</span> : null}
                  <b className="results-total">{pct(r.scores.total)}</b>
                </div>
                {r.hasDetail ? (
                  <Link href={`/results/${r.type}/${r.id}`} className="btn btn-light btn-sm">Xem chi tiết</Link>
                ) : (
                  <span className="muted small results-old">Không có chi tiết bài làm (làm trước khi có tính năng xem lại, hoặc hết giờ)</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {next ? (
        <button type="button" className="btn btn-light" disabled={loading} onClick={() => void more()}>{loading ? "Đang tải…" : "Xem thêm"}</button>
      ) : null}
    </div>
  );
}
