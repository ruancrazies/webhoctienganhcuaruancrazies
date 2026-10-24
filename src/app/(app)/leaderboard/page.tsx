import { BlitzBoard } from "./BlitzBoard";
import { fmtNumber } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getLeaderboard } from "@/server/services";

export const metadata = { title: "Xếp hạng · English Game" };
export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const user = await requireUser();
  const { rows } = await getLeaderboard(user.id);
  const meIn = rows.some((r) => r.isMe);

  return (
    <main className="page page-narrow">
      <header className="stack" style={{ gap: 6 }}>
        <h1>Xếp hạng</h1>
        <p className="muted">Top 10 theo tổng XP. Bảng cập nhật mỗi phút.</p>
      </header>

      <section className="sheet" aria-labelledby="xp-h">
        <h2 id="xp-h" style={{ marginBottom: 6 }}>Tổng XP</h2>
        {rows.length === 0 ? (
          <div className="state">
            <div className="big" aria-hidden="true">🏁</div>
            <p className="muted">Chưa có ai trên bảng. Chơi một vòng để lên đầu bảng.</p>
          </div>
        ) : (
          <ol className="board">
            {rows.map((r) => (
              <li key={r.rank} className={r.isMe ? "me" : undefined} aria-current={r.isMe ? "true" : undefined}>
                <span className={`rank${r.rank <= 3 ? ` r${r.rank}` : ""}`}>{r.rank}</span>
                <span className="who">
                  <b>{r.username}{r.isMe ? " (bạn)" : ""}</b>
                  <span className="muted small">{r.level ? `Đã qua cấp ${r.level}` : "Chưa qua cấp nào"}</span>
                </span>
                <span className="pts">{fmtNumber(r.xp)} XP</span>
              </li>
            ))}
          </ol>
        )}
        {rows.length > 0 && !meIn ? <p className="muted small" style={{ marginTop: 10 }}>Bạn chưa vào top 10. Chơi thêm để lên bảng.</p> : null}
      </section>

      <BlitzBoard />
    </main>
  );
}
