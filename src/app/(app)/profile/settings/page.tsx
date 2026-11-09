import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { MuteToggle } from "@/components/MuteButton";
import { PetSettings } from "@/components/PetSettings";
import { AccentPicker } from "@/components/AccentPicker";
import { AutoThemeSwitch } from "@/components/ThemeToggle";
import { ACCENTS, accentCss, accentSwatchCss, resolveAccentId } from "@/cosmetics/core/accents";
import { THEMES } from "@/cosmetics/registry";
import { requireUser } from "@/server/auth/session";
import { getAccentId, getProfile } from "@/server/repo";
import { notFound } from "next/navigation";
import { AvatarPicker, UsernameForm } from "../AccountSettings";

export const metadata = { title: "Cài đặt · Web học từ vựng" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  if (!profile) notFound();
  const accent = resolveAccentId(await getAccentId(user.id));
  // Trang này mang CSS của MỌI màu nhấn (vài trăm byte mỗi màu) để đổi màu tức thì mà không phải tải lại.
  const accentStyles = ACCENTS.map((a) => accentCss(a.id, THEMES)).join("") + accentSwatchCss(THEMES);

  return (
    <main className="page page-narrow">
      <p><Link href="/profile" className="back">‹ Tôi</Link></p>
      <h1>Cài đặt</h1>

      <section className="sheet sheet-plain stack" aria-labelledby="ac-h">
        <h2 id="ac-h">Tài khoản</h2>
        <UsernameForm username={profile.username} />
        {/* Chuyển tiếp: avatar emoji cũ. Bỏ khi bộ avatar minh họa vào (xem docs/giai-doan-2.md, mục "Chuyển avatar emoji"). */}
        <AvatarPicker avatar={profile.avatar} username={profile.username} />
      </section>

      <section className="sheet sheet-plain stack" aria-labelledby="gd-h">
        <h2 id="gd-h">Giao diện</h2>
        <div className="toggle">
          <div>
            <b>Tự động theo thiết bị</b>
            <p className="muted">Tối khi thiết bị ở chế độ tối, còn lại Vở ô ly. Chọn một giao diện khác thì tự tắt.</p>
          </div>
          <AutoThemeSwitch />
        </div>
        <p className="small"><Link href="/profile/collection?tab=theme">Chọn giao diện trong Bộ sưu tập</Link></p>
        <style data-accent-all dangerouslySetInnerHTML={{ __html: accentStyles }} />
        <AccentPicker options={ACCENTS.map((a) => ({ id: a.id, name: a.name }))} initial={accent} />
      </section>

      <section className="sheet sheet-plain stack" aria-labelledby="st-h">
        <h2 id="st-h">Âm thanh và thú cưng</h2>
        <MuteToggle />
        <PetSettings />
      </section>

      <section className="sheet sheet-plain stack" aria-labelledby="out-h">
        <h2 id="out-h">Đăng xuất</h2>
        <form action={logoutAction}>
          <button type="submit" className="btn btn-light">Đăng xuất</button>
        </form>
      </section>
    </main>
  );
}
