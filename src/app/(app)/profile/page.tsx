import { logoutAction } from "@/app/(auth)/actions";
import { Avatar } from "@/components/Avatar";
import { MuteToggle } from "@/components/MuteButton";
import { PetSettings } from "@/components/PetSettings";
import { ThemePicker } from "@/components/ThemeToggle";
import { LEVEL_NAMES, fmtNumber, ratio } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getHome } from "@/server/services";
import { AvatarPicker, UsernameForm } from "./AccountSettings";

export const metadata = { title: "Hồ sơ · Web học từ vựng" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  const { profile, levels } = await getHome(user.id);
  const passed = levels.filter((l) => l.pass).length;
  const learned = levels.reduce((a, l) => a + l.learned, 0);
  const mastered = levels.reduce((a, l) => a + l.mastered, 0);
  const today = ratio(profile.xpToday, profile.dailyXpCap);

  return (
    <main className="page page-narrow">
      <section className="row" style={{ gap: 16, flexWrap: "nowrap" }} aria-labelledby="pf-h">
        <Avatar avatar={profile.avatar} username={profile.username} />
        <div style={{ minWidth: 0 }}>
          <h1 id="pf-h" style={{ overflowWrap: "anywhere" }}>{profile.username}</h1>
          <p className="muted" style={{ overflowWrap: "anywhere" }}>{user.email}</p>
        </div>
      </section>

      <section className="stats" aria-label="Thống kê">
        <div className="stat"><b>{fmtNumber(profile.xp)}</b><span>tổng XP</span></div>
        <div className="stat"><b>🔥 {profile.streak}</b><span>chuỗi hiện tại</span></div>
        <div className="stat"><b>{profile.bestStreak}</b><span>chuỗi dài nhất</span></div>
      </section>

      <section className="sheet" aria-labelledby="td-h">
        <div className="stack">
          <div className="spread">
            <h2 id="td-h">Hôm nay</h2>
            <span className="muted small">{fmtNumber(profile.xpToday)} / {fmtNumber(profile.dailyXpCap)} XP</span>
          </div>
          <div className="bar bar-mark" role="progressbar" aria-valuemin={0} aria-valuemax={profile.dailyXpCap} aria-valuenow={profile.xpToday} aria-label="XP hôm nay">
            <i style={{ width: `${today * 100}%` }} />
          </div>
          <p className="muted small">Mỗi ngày nhận tối đa {fmtNumber(profile.dailyXpCap)} XP (tính theo giờ Việt Nam).</p>
        </div>
      </section>

      <section className="sheet sheet-plain stack" aria-labelledby="jn-h">
        <div className="spread">
          <h2 id="jn-h">Lộ trình</h2>
          <span className="muted small">Đã qua {passed}/5 bài kiểm tra</span>
        </div>
        <div className="journey">
          {levels.map((l) => (
            <div key={l.cefr} className={`jn ${l.pass ? "pass" : l.unlocked ? "open" : ""}`}>
              <b>{l.cefr}</b>
              <span className="small muted">{LEVEL_NAMES[l.cefr]}</span>
              <span className="small">{l.pass ? "✓ Đã qua" : l.unlocked ? (l.cefr === "C2" ? "Đang mở" : "Đang học") : "🔒 Khóa"}</span>
            </div>
          ))}
        </div>
        <p className="muted small">
          Tổng cộng đã học {fmtNumber(learned)} từ, đã thuộc {fmtNumber(mastered)} từ (từ phổ thông, mọi cấp).
        </p>
      </section>

      <section className="sheet sheet-plain stack" aria-labelledby="ac-h">
        <h2 id="ac-h">Tài khoản</h2>
        <UsernameForm username={profile.username} />
        <AvatarPicker avatar={profile.avatar} username={profile.username} />
      </section>

      <section className="sheet sheet-plain stack" aria-labelledby="st-h">
        <h2 id="st-h">Cài đặt</h2>
        <ThemePicker />
        <MuteToggle />
        <PetSettings />
        <form action={logoutAction}>
          <button type="submit" className="btn btn-light">Đăng xuất</button>
        </form>
      </section>
    </main>
  );
}
