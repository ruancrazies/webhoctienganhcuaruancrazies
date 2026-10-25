import { DailyQuests } from "@/components/DailyQuests";
import { LevelProgress } from "@/components/LevelProgress";
import { fmtNumber } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getDailyQuests, getHome } from "@/server/services";

export const metadata = { title: "Nhiệm vụ · Web học từ vựng" };
export const dynamic = "force-dynamic";

export default async function QuestsPage() {
  const user = await requireUser();
  const [{ profile }, quests] = await Promise.all([getHome(user.id), getDailyQuests(user.id)]);

  return (
    <main className="page page-narrow">
      <header className="stack" style={{ gap: 6 }}>
        <h1>Nhiệm vụ &amp; Level</h1>
        <p className="muted">Hoàn thành nhiệm vụ mỗi ngày để nhận thêm XP và lên level.</p>
      </header>

      <section className="sheet" aria-labelledby="lvl-h">
        <div className="stack">
          <div className="spread">
            <h2 id="lvl-h">Level</h2>
            <span className="muted small">{fmtNumber(profile.xp)} XP tổng cộng</span>
          </div>
          <LevelProgress xp={profile.xp} />
        </div>
      </section>

      <DailyQuests initial={quests} />
    </main>
  );
}
