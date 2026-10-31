import Link from "next/link";
import { SKILL_LABEL } from "@/core/skills";
import { TodayActions } from "@/components/TodayActions";
import { GAMES } from "@/games/registry";
import { fmtNumber, pct } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getInsights } from "@/server/services";

export const metadata = { title: "Hồ sơ năng lực · Web học từ vựng" };
export const dynamic = "force-dynamic";

const gameName = (id: string) => GAMES.find((g) => g.id === id)?.name ?? id;

/** Chênh lệch điểm phần trăm (đã là số 0..1) → "▲ 12 điểm"; null → không hiện. */
function Trend({ v }: { v: number | null }) {
  if (v === null || Math.abs(v) < 0.005) return null;
  const pts = Math.round(Math.abs(v) * 100);
  return v > 0 ? <span className="up small">▲ {pts} điểm</span> : <span className="down small">▼ {pts} điểm</span>;
}

const hourLabel = (h: number) => `${h}h`;

export default async function InsightsPage() {
  const user = await requireUser();
  const { metrics: m, actions, level, dueCount } = await getInsights(user.id);
  const b = m.behavior;
  const enough = m.samples >= 20;
  const measured = m.skills.filter((s) => s.n > 0);

  return (
    <main className="page page-narrow">
      <header className="stack" style={{ gap: 6 }}>
        <h1>Hồ sơ năng lực</h1>
        <p className="muted">
          Tính từ {fmtNumber(m.samples)} câu bạn đã trả lời trong {m.windowDays} ngày gần nhất; câu mới nặng hơn câu cũ.
          Số liệu chỉ dùng để gợi ý cho chính bạn.
        </p>
      </header>

      <TodayActions actions={actions} showAll />
      {actions.length === 0 ? (
        <section className="sheet sheet-plain">
          <p className="muted">Hôm nay chưa có gợi ý đặc biệt. Cứ chơi một vòng ở cấp {level.cefr} để hồ sơ được cập nhật.</p>
        </section>
      ) : null}

      {!enough ? (
        <section className="sheet sheet-plain stack">
          <h2>Chưa đủ dữ liệu</h2>
          <p className="muted">
            Mới có {fmtNumber(m.samples)} câu. Cần khoảng 20 câu trở lên mới nhận ra điểm mạnh, điểm yếu một cách đáng tin.
            Chơi thêm vài vòng nhé!
          </p>
          <Link href={`/level/${level.cefr}`} className="btn btn-mark">Vào cấp {level.cefr}</Link>
        </section>
      ) : (
        <>
          <section className="sheet stack" aria-labelledby="ov-h">
            <div className="spread">
              <h2 id="ov-h">Tổng quan</h2>
              <Trend v={m.overall.trend} />
            </div>
            <div className="kv">
              <div><b>{m.overall.acc === null ? "—" : pct(m.overall.acc)}</b><span className="muted small">đúng (gần đây nặng hơn)</span></div>
              <div><b>{fmtNumber(b.activeDays14)}/14</b><span className="muted small">ngày có học</span></div>
              <div><b>{fmtNumber(dueCount)}</b><span className="muted small">từ đến hạn ôn</span></div>
            </div>
          </section>

          <section className="sheet stack" aria-labelledby="sk-h">
            <h2 id="sk-h">Kỹ năng</h2>
            {measured.map((s) => (
              <div key={s.skill} className={`skill-row ${s.n < 8 ? "dim" : ""}`}>
                <div className="spread">
                  <span>{SKILL_LABEL[s.skill]}</span>
                  <span className="small">
                    {s.acc === null ? "—" : pct(s.acc)} <span className="muted">· {fmtNumber(s.n)} câu</span> <Trend v={s.trend} />
                  </span>
                </div>
                <div className="bar bar-good" role="img" aria-label={`${SKILL_LABEL[s.skill]}: ${s.acc === null ? "chưa có" : pct(s.acc)}`}>
                  <i style={{ width: `${(s.acc ?? 0) * 100}%` }} />
                </div>
              </div>
            ))}
            {m.skills.some((s) => s.n === 0) ? (
              <p className="muted small">
                Chưa có dữ liệu: {m.skills.filter((s) => s.n === 0).map((s) => SKILL_LABEL[s.skill].toLowerCase()).join(", ")}.
              </p>
            ) : null}
            {measured.some((s) => s.n < 8) ? <p className="muted small">Kỹ năng mờ là chưa đủ 8 câu nên chưa đáng tin.</p> : null}
          </section>

          <section className="sheet stack" aria-labelledby="wk-h">
            <h2 id="wk-h">Điểm cần luyện thêm</h2>
            {m.weak.length === 0 ? (
              <p className="muted">Chưa có nhóm nào đúng dưới 70% với đủ 5 câu. Tốt lắm!</p>
            ) : (
              <>
                <ul className="weak-list">
                  {m.weak.map((w) => (
                    <li key={w.key}>
                      <span>{w.label}</span>
                      <span className="small">{pct(w.acc)} <span className="muted">· {w.n} câu</span></span>
                    </li>
                  ))}
                </ul>
                <p className="muted small">Các vòng chơi tiếp theo sẽ ưu tiên từ và câu thuộc những nhóm này (nhưng không dồn hết vào đó).</p>
              </>
            )}
          </section>

          <section className="sheet stack" aria-labelledby="hb-h">
            <h2 id="hb-h">Thói quen học</h2>
            <div className="kv">
              <div>
                <b>{b.usualHours.length ? b.usualHours.map(hourLabel).join(", ") : "—"}</b>
                <span className="muted small">giờ hay học (giờ VN)</span>
              </div>
              <div>
                <b>{b.sessionMedianMin === null ? "—" : `${b.sessionMedianMin} phút`}</b>
                <span className="muted small">độ dài một phiên (trung vị)</span>
              </div>
              <div>
                <b>{b.favoriteGames.length ? b.favoriteGames.map((g) => gameName(g.game)).join(", ") : "—"}</b>
                <span className="muted small">trò hay chơi</span>
              </div>
              <div>
                <b>{b.abandonRate === null ? "—" : pct(b.abandonRate)}</b>
                <span className="muted small">vòng bỏ dở</span>
              </div>
              <div>
                <b>{b.speedRatio === null ? "—" : b.speedRatio < 0.9 ? "Nhanh hơn mức chung" : b.speedRatio > 1.25 ? "Chậm hơn mức chung" : "Gần mức chung"}</b>
                <span className="muted small">tốc độ trả lời</span>
              </div>
              <div>
                <b>{b.hintRate === null ? "—" : pct(b.hintRate)}</b>
                <span className="muted small">câu dùng gợi ý</span>
              </div>
            </div>
          </section>
        </>
      )}

      {m.exams.count > 0 && m.exams.lastTotal !== null ? (
        <section className="sheet stack" aria-labelledby="ex-h">
          <h2 id="ex-h">Bài kiểm tra gần nhất</h2>
          <div className="kv">
            <div>
              <b>{pct(m.exams.lastTotal)}</b>
              <span className="muted small">
                tổng điểm {m.exams.prevTotal !== null ? <Trend v={m.exams.lastTotal - m.exams.prevTotal} /> : null}
              </span>
            </div>
            {(["vocab", "grammar", "reading", "listening"] as const).map((p) => {
              const v = m.exams.parts[p];
              if (v.last === null) return null;
              return (
                <div key={p}>
                  <b>{pct(v.last)}</b>
                  <span className="muted small">{{ vocab: "từ vựng", grammar: "ngữ pháp", reading: "đọc hiểu", listening: "nghe" }[p]} {v.prev !== null ? <Trend v={v.last - v.prev} /> : null}</span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}
