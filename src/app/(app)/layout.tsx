import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { TabBar, TopNav } from "@/components/Nav";
import { PetBackground, PetChatButton } from "@/components/PetBackground";
import { PetChat } from "@/components/PetChat";
import { QuickMenu } from "@/components/QuickMenu";
import { xpLevelOf } from "@/core/xpLevel";
import { themeOptions } from "@/cosmetics/registry";
import { requireUser } from "@/server/auth/session";
import { getProfile } from "@/server/repo";

/** Khung chung của mọi trang sau đăng nhập. Lớp bảo vệ thật là requireUser() (proxy chỉ là tiện lợi). */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const me = await getProfile(user.id);
  const level = me ? xpLevelOf(me.xp).level : null;
  const meAvatar = me ? <Avatar avatar={me.avatar} username={me.username} size="sm" /> : null;
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
          <QuickMenu themes={themeOptions()} />
        </div>
      </header>
      <PetBackground />
      <PetChat />
      {children}
      <TabBar me={meAvatar} />
    </div>
  );
}
