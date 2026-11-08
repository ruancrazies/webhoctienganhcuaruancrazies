import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { TabBar, TopNav } from "@/components/Nav";
import { CosmeticWatcher } from "@/components/CosmeticWatcher";
import { PetBackground, PetChatButton } from "@/components/PetBackground";
import { PetChat } from "@/components/PetChat";
import { QuickMenu } from "@/components/QuickMenu";
import { xpLevelOf } from "@/core/xpLevel";
import { requireUser } from "@/server/auth/session";
import { getProfile } from "@/server/repo";
import { getMyLook, usableThemeOptions } from "@/server/services";

/** Khung chung của mọi trang sau đăng nhập. Lớp bảo vệ thật là requireUser() (proxy chỉ là tiện lợi). */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const me = await getProfile(user.id);
  const level = me ? xpLevelOf(me.xp).level : null;
  // Bộ hiển thị đã qua kiểm sở hữu/hạn dùng: món hết hạn tự về mặc định ngay cả khi hồ sơ còn ghi mã cũ.
  const mine = me ? await getMyLook(me) : null;
  const meAvatar = me && mine ? <Avatar avatar={mine.look.avatar} frame={mine.look.frame} username={me.username} size="sm" /> : null;
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-in">
          <Link href="/" className="logo">
            <span className="logo-mark" aria-hidden="true">Aa</span>
            Web học từ vựng
          </Link>
          <TopNav />
          {me ? (
            <Link href="/profile" className="topbar-me" aria-label={`Hồ sơ của ${me.username}, Level ${level}`}>
              {meAvatar}
              <span className="chip chip-mark">Level {level}</span>
            </Link>
          ) : null}
          <PetChatButton />
          <QuickMenu themes={usableThemeOptions(mine?.owned ?? [])} />
        </div>
      </header>
      <CosmeticWatcher />
      <PetBackground />
      <PetChat />
      {children}
      <TabBar me={meAvatar} />
    </div>
  );
}
