import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { DailyQuests } from "@/components/DailyQuests";
import { EventCard, type EventCardData } from "@/components/EventQuests";
import { LevelProgress } from "@/components/LevelProgress";
import { xpLevelOf } from "@/core/xpLevel";
import { fmtNumber } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { notFound } from "next/navigation";
import { getProfile } from "@/server/repo";
import { getDailyQuests, getMyEvents, getMyLook, type EventView } from "@/server/services";

export const metadata = { title: "Nhiệm vụ · Web học từ vựng" };
export const dynamic = "force-dynamic";

type Tab = "daily" | "events";
const tabOf = (v: string | string[] | undefined): Tab => ((Array.isArray(v) ? v[0] : v) === "events" ? "events" : "daily");

/** Hình món thưởng cạnh dòng thưởng: khung và avatar vẽ bằng Avatar; theme chỉ ghi chữ (không nạp CSS mọi theme ở trang này). */
function artOf(ev: EventView, username: string, myAvatar: string | null): EventCardData["art"] {
  const art: NonNullable<EventCardData["art"]> = {};
  for (const t of ev.tasks) {
    const r = t.reward;
    if (!r || art[r.id]) continue;
    if (r.kind === "frame") art[r.id] = <Avatar avatar={myAvatar} frame={r.id} username={username} size="sm" />;
    else if (r.kind === "avatar") art[r.id] = <Avatar avatar={r.id} username={username} size="sm" />;
  }
  return art;
}

export default async function QuestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const tab = tabOf((await searchParams).tab);
  const [profile, quests, mine] = await Promise.all([getProfile(user.id), getDailyQuests(user.id), getMyEvents(user.id)]);
  if (!profile) notFound();
  const { look } = await getMyLook(profile);
  const lv = xpLevelOf(profile.xp);
  const running = mine.events.length;

  return (
    <main className="page page-narrow">
      <header className="stack" style={{ gap: 6 }}>
        <h1>Nhiệm vụ</h1>
        <p className="muted">Hoàn thành nhiệm vụ để nhận thêm XP, khung avatar và các món sưu tầm.</p>
      </header>

      {/* Level chỉ còn dải tóm tắt; đầy đủ ở tab Tôi. */}
      <Link href="/profile" className="lvl-strip" aria-label={`Level ${lv.level}, ${fmtNumber(profile.xp)} XP. Xem hồ sơ`}>
        <span className="chip chip-mark">Level {lv.level}</span>
        <LevelProgress xp={profile.xp} compact />
      </Link>

      <nav className="scope" aria-label="Mục của tab Nhiệm vụ">
        <Link href="/quests" className="pill" aria-current={tab === "daily" ? "page" : undefined}>Hằng ngày</Link>
        <Link href="/quests?tab=events" className="pill" aria-current={tab === "events" ? "page" : undefined}>
          Sự kiện
          {mine.claimable > 0 ? <span className="tab-dot">{mine.claimable}<span className="sr-only"> phần thưởng có thể nhận</span></span> : running > 0 ? <span className="cos-cnt"> {running}</span> : null}
        </Link>
      </nav>

      {tab === "daily" ? (
        <DailyQuests initial={quests} />
      ) : mine.events.length ? (
        mine.events.map((ev) => (
          <EventCard key={ev.key} ev={{ key: ev.key, name: ev.name, blurb: ev.blurb, phase: ev.phase, countdown: ev.countdown, lastDay: ev.lastDay, tasks: ev.tasks, art: artOf(ev, profile.username, look.avatar) }} />
        ))
      ) : (
        <div className="state sheet sheet-plain">
          <p>Chưa có sự kiện nào đang diễn ra. Khi có sự kiện mới, nhiệm vụ và phần thưởng sẽ hiện ở đây.</p>
        </div>
      )}
    </main>
  );
}
