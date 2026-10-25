"use client";

import Link from "next/link";
import { xpLevelOf } from "@/core/xpLevel";
import { fmtNumber } from "@/lib/format";
import { speak } from "@/lib/sound";
import { learnHref } from "../registry";
import type { GameMeta } from "../registry";
import { DONT_KNOW } from "./types";
import type { ReviewItem } from "@/core/types";
import type { FinishResponse } from "@/types/api";

type Props = {
  meta: GameMeta;
  result: FinishResponse;
  /** Số câu/thẻ/cặp đã nộp. */
  answered: number;
  /** Số câu của cả vòng. */
  total: number;
  cefr: string;
  scope: { cefr: string; domain?: string; topic?: string };
  onReplay: () => void;
};

const asText = (v: string | string[] | undefined): string => (Array.isArray(v) ? v.join(" ") : (v ?? ""));

/** Đáp án của người chơi → chữ hiển thị (xử lý "Chưa biết", bỏ trống, đúng/sai). */
function yours(game: ReviewItem["game"], v: string | string[] | undefined): string {
  const t = asText(v).trim();
  if (t === "") return "(bỏ trống)";
  if (t === DONT_KNOW) return "(chưa biết)";
  if (game === "tf") return t === "true" ? "Đúng" : "Sai";
  return t;
}

function expectedText(r: ReviewItem): string {
  const t = asText(r.expected);
  if (r.game === "tf") return t === "true" ? "Đúng" : "Sai";
  return t;
}

function ReviewRow({ r }: { r: ReviewItem }) {
  const showMeaning = r.en && r.vi && r.game !== "grammar" && r.game !== "tf";
  return (
    <article className="rv">
      <div className="spread" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
        <p className="q">{r.prompt.replace("___", "_____")}</p>
        {r.en ? (
          <button type="button" className="icon-btn" onClick={() => speak(r.en!, { force: true })} aria-label={`Nghe ${r.en}`}>
            🔊
          </button>
        ) : null}
      </div>
      <p>
        Đáp án đúng: <span className="ok">{expectedText(r)}</span>
      </p>
      <p className="muted small">
        Bạn trả lời: <span className="no">{yours(r.game, r.yourAnswer)}</span>
      </p>
      {showMeaning ? <p className="muted small">{r.en} = {r.vi}</p> : null}
      {r.explanation ? <p className="small">{r.explanation}</p> : null}
    </article>
  );
}

/** Màn kết quả của một vòng: XP, chuỗi ngày, bảng Blitz, danh sách "cần ôn lại". */
export function ResultView({ meta, result, answered, total, cefr, scope, onReplay }: Props) {
  const graded = meta.id !== "flash" && meta.id !== "match";
  const wrong = result.review.length;
  const right = Math.max(0, answered - wrong);
  const lvAfter = xpLevelOf(result.xp);
  const lvBefore = xpLevelOf(result.xp - result.xpGained);
  const leveledUp = lvAfter.level > lvBefore.level;
  const unit = meta.id === "flash" ? "thẻ" : meta.id === "match" ? "cặp" : "câu";

  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="sheet" aria-labelledby="gr-h">
        <div className="grade">
          <h1 id="gr-h" style={{ fontSize: 14, fontWeight: 600, color: "var(--pencil)" }}>
            {meta.emoji} {meta.name} · cấp {cefr}
          </h1>
          <div className="score" aria-label={`Nhận được ${result.xpGained} XP`} style={{ fontSize: result.xpGained >= 1000 ? 38 : 48 }}>
            +{fmtNumber(result.xpGained)}
          </div>
          <p className={`verdict${result.perfect ? " pass" : ""}`}>
            {result.perfect ? "Đúng hết! Thưởng thêm 20% XP" : wrong === 0 && graded ? "Làm tốt lắm!" : "XP"}
          </p>
          {result.newBest ? <p className="chip chip-mark">🏅 Kỷ lục mới của bạn!</p> : null}
          {leveledUp ? <p className="chip chip-good" role="status">🎉 Lên Level {lvAfter.level}!</p> : null}
        </div>

        <div className="stats" style={{ marginTop: 12, gridTemplateColumns: "repeat(2, 1fr)" }}>
          <div className="stat">
            <b>{fmtNumber(result.xp)}</b>
            <span>Tổng XP</span>
          </div>
          <div className="stat">
            <b>Lv {lvAfter.level}</b>
            <span>{lvAfter.maxed ? "Tối đa" : `Còn ${fmtNumber(lvAfter.toNext)} XP`}</span>
          </div>
          <div className="stat">
            <b>🔥 {result.streak}</b>
            <span>Chuỗi ngày</span>
          </div>
          <div className="stat">
            {graded && meta.id !== "blitz" ? (
              <>
                <b>{right}/{total}</b>
                <span>Câu đúng</span>
              </>
            ) : (
              <>
                <b>{answered}</b>
                <span>{meta.id === "blitz" ? "Câu đã trả lời" : `${unit[0].toUpperCase()}${unit.slice(1)} hoàn thành`}</span>
              </>
            )}
          </div>
        </div>

        {result.xpGained === 0 ? (
          <p className="gate" style={{ marginTop: 12 }}>
            Vòng này không được cộng XP: có thể bạn chưa trả lời đúng câu nào, hoặc đã đạt giới hạn XP của hôm nay.
          </p>
        ) : null}
        {meta.srs && wrong > 0 ? (
          <p className="muted small" style={{ marginTop: 12 }}>Các từ làm sai sẽ được hỏi lại sớm trong những vòng sau.</p>
        ) : null}
      </section>

      {result.board && result.board.length > 0 ? (
        <section className="sheet" aria-labelledby="bd-h">
          <h2 id="bd-h" style={{ marginBottom: 8 }}>⚡ Top 5 Đua tốc độ cấp {cefr}</h2>
          <ol className="board">
            {result.board.map((r, i) => (
              <li key={`${r.username}-${i}`}>
                <span className={`rank${i < 3 ? ` r${i + 1}` : ""}`}>{i + 1}</span>
                <span className="who"><b>{r.username}</b></span>
                <span className="pts">{fmtNumber(r.best)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="row">
        <button type="button" className="btn btn-mark" onClick={onReplay}>Chơi lại</button>
        <Link href={`/level/${cefr}`} className="btn btn-light">Chọn trò khác</Link>
        {wrong > 0 ? <Link href={learnHref(scope)} className="btn btn-light">Xem lại từ vựng</Link> : null}
      </div>

      {wrong > 0 ? (
        <section className="stack" aria-labelledby="rv-h">
          <h2 id="rv-h">Cần ôn lại ({wrong})</h2>
          <div className="review">
            {result.review.map((r) => (
              <ReviewRow key={r.qid} r={r} />
            ))}
          </div>
        </section>
      ) : graded && answered > 0 ? (
        <p className="muted">Bạn không sai câu nào.</p>
      ) : null}
    </div>
  );
}
