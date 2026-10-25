import Link from "next/link";
import { DailyQuests } from "@/components/DailyQuests";
import { LevelProgress } from "@/components/LevelProgress";
import { LEVEL_NAMES, fmtNumber, ratio } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getDailyQuests, getHome } from "@/server/services";
import type { HomeLevel } from "@/types/api";

export const metadata = { title: "Trang chủ · Web học từ vựng" };
export const dynamic = "force-dynamic";

function statusChip(l: HomeLevel) {
  if (!l.unlocked) return <span className="chip chip-plain">🔒 Khóa</span>;
  if (l.pass) return <span className="chip chip-good">✓ Đã qua</span>;
  if (l.eligible) return <span className="chip chip-mark">Sẵn sàng thi</span>;
  return <span className="chip">Đang học</span>;
}

function LevelRow({ l }: { l: HomeLevel }) {
  const learned = ratio(l.learned, l.total);
  const mastered = ratio(l.mastered, l.total);
  const missing = Math.max(0, l.needLearned - l.learnedCum);
  const body = (
    <>
      <span className="lv-code">{l.cefr}</span>
      <span className="lv-body">
        <span className="row" style={{ gap: 8 }}>
          <span className="lv-name">{LEVEL_NAMES[l.cefr]}</span>
          {statusChip(l)}
        </span>
        {l.unlocked ? (
          <>
            <span className="bar bar-stack" role="img" aria-label={`Đã học ${l.learned} trên ${l.total} từ, đã thuộc ${l.mastered}`}>
              <i style={{ width: `${learned * 100}%` }} />
              <i style={{ width: `${mastered * 100}%` }} />
            </span>
            <span className="lv-meta">
              <span>{l.total > 0 ? `Đã học ${fmtNumber(l.learned)}/${fmtNumber(l.total)} từ` : "Chưa có từ vựng"}</span>
              <span>Đã thuộc {fmtNumber(l.mastered)}</span>
              {!l.pass && l.cefr !== "C2" && !l.eligible && l.total > 0 ? <span>Cần học thêm {fmtNumber(missing)} từ để được thi</span> : null}
            </span>
          </>
        ) : (
          <span className="lv-meta">Qua bài kiểm tra cấp trước để mở</span>
        )}
      </span>
      <span className="lv-go" aria-hidden="true">{l.unlocked ? "›" : ""}</span>
    </>
  );
  return l.unlocked ? (
    <Link href={`/level/${l.cefr}`} className="lv">{body}</Link>
  ) : (
    <div className="lv locked" aria-disabled="true">{body}</div>
  );
}

export default async function HomePage() {
  const user = await requireUser();
  const [home, quests] = await Promise.all([getHome(user.id), getDailyQuests(user.id)]);
  const { profile, levels, dueCount } = home;

  const current = levels.find((l) => l.unlocked && !l.pass) ?? levels[levels.length - 1];
  const todayRatio = ratio(profile.xpToday, profile.dailyXpCap);

  return (
    <main className="page">
      <section className="hello" aria-labelledby="hello-h">
        <h1 id="hello-h">
          Chào <span className="name">{profile.username}</span>
        </h1>
        <div className="stats">
          <div className="stat">
            <b>🔥 {profile.streak}</b>
            <span>ngày liên tiếp</span>
          </div>
          <div className="stat">
            <b>{fmtNumber(profile.xp)}</b>
            <span>tổng XP</span>
          </div>
          <div className="stat">
            <b>{current.cefr}</b>
            <span>cấp hiện tại</span>
          </div>
        </div>
        <LevelProgress xp={profile.xp} />
        <div className="today">
          <div className="spread small">
            <span>XP hôm nay</span>
            <span className="muted">{fmtNumber(profile.xpToday)} / {fmtNumber(profile.dailyXpCap)}</span>
          </div>
          <div className="bar bar-mark" role="progressbar" aria-valuemin={0} aria-valuemax={profile.dailyXpCap} aria-valuenow={profile.xpToday} aria-label="XP hôm nay">
            <i style={{ width: `${todayRatio * 100}%` }} />
          </div>
        </div>
      </section>

      <DailyQuests initial={quests} />

      <section className="due" aria-label="Ôn tập">
        <div>
          {dueCount > 0 ? (
            <>
              <b>{fmtNumber(dueCount)} từ đến hạn ôn</b>
              <p className="muted">Chơi một vòng ở cấp {current.cefr}: các trò sẽ ưu tiên những từ này.</p>
            </>
          ) : (
            <>
              <b>Hôm nay chưa có từ cần ôn</b>
              <p className="muted">Học thêm từ mới để có từ vào lịch ôn.</p>
            </>
          )}
        </div>
        <Link href={`/level/${current.cefr}`} className="btn btn-mark">
          {dueCount > 0 ? "Ôn ngay" : `Vào cấp ${current.cefr}`}
        </Link>
      </section>

      <section className="sheet" aria-labelledby="lv-h">
        <div className="spread" style={{ marginBottom: 8 }}>
          <h2 id="lv-h">Các cấp độ</h2>
          <span className="muted small">Qua bài kiểm tra để mở cấp kế tiếp</span>
        </div>
        <div className="levels">
          {levels.map((l) => (
            <LevelRow key={l.cefr} l={l} />
          ))}
        </div>
      </section>
    </main>
  );
}
