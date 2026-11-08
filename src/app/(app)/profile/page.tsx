import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { LevelProgress } from "@/components/LevelProgress";
import { dayNo, displayStreak } from "@/core/streak";
import { fmtNumber } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getProfile } from "@/server/repo";
import { countUnseen, getMyLook } from "@/server/services";
import { notFound } from "next/navigation";

export const metadata = { title: "Tôi · Web học từ vựng" };
export const dynamic = "force-dynamic";

/**
 * Tab "Tôi": thẻ danh tính gọn + ba lối vào (Kết quả, Bộ sưu tập, Cài đặt). Mọi thứ khác chuyển đi nơi nó thuộc về:
 * XP hôm nay và lộ trình các cấp ở tab Học, hồ sơ năng lực ở tab Học → Năng lực, tài khoản và âm thanh ở Cài đặt.
 */
export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  if (!profile) notFound();
  const [{ look }, unseen] = await Promise.all([getMyLook(profile), countUnseen(user.id).catch(() => 0)]);
  const streak = displayStreak({ lastDay: profile.lastDay, streak: profile.streak, bestStreak: profile.bestStreak }, dayNo(new Date()));

  return (
    <main className="page page-narrow">
      <section className="row" style={{ gap: 16, flexWrap: "nowrap" }} aria-labelledby="pf-h">
        <Avatar avatar={look.avatar} frame={look.frame} username={profile.username} />
        <div style={{ minWidth: 0 }}>
          <h1 id="pf-h" style={{ overflowWrap: "anywhere" }}>{profile.username}</h1>
          <p className="muted" style={{ overflowWrap: "anywhere" }}>{user.email}</p>
        </div>
      </section>

      <section className="sheet" aria-label="Level">
        <LevelProgress xp={profile.xp} />
      </section>

      <section className="stats" aria-label="Thống kê">
        <div className="stat"><b>{fmtNumber(profile.xp)}</b><span>tổng XP</span></div>
        <div className="stat"><b>{streak}</b><span>chuỗi hiện tại</span></div>
        <div className="stat"><b>{profile.bestStreak}</b><span>chuỗi dài nhất</span></div>
      </section>

      <nav className="stack" aria-label="Mục của tôi">
        <Link href="/results" className="linkcard">
          <span className="linkcard-t"><b>Kết quả bài kiểm tra</b><span className="muted small">Mở lại các bài thi đã nộp để xem đáp án.</span></span>
          <Icon name="chevron-right" />
        </Link>
        <Link href="/profile/collection" className="linkcard">
          <span className="linkcard-t">
            <b>Bộ sưu tập {unseen > 0 ? <span className="chip chip-mark">{unseen} món mới</span> : null}</b>
            <span className="muted small">Giao diện, avatar và khung bạn đã mở khóa.</span>
          </span>
          <Icon name="chevron-right" />
        </Link>
        <Link href="/profile/settings" className="linkcard">
          <span className="linkcard-t"><b>Cài đặt</b><span className="muted small">Tài khoản, âm thanh, thú cưng, đăng xuất.</span></span>
          <Icon name="chevron-right" />
        </Link>
      </nav>
    </main>
  );
}
