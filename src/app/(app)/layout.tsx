import Link from "next/link";
import type { ReactNode } from "react";
import { MuteButton } from "@/components/MuteButton";
import { TabBar, TopNav } from "@/components/Nav";
import { PetBackground, PetButton } from "@/components/PetBackground";
import { ThemeButton } from "@/components/ThemeToggle";
import { requireUser } from "@/server/auth/session";
import "../app.css";

/** Khung chung của mọi trang sau đăng nhập. Lớp bảo vệ thật là requireUser() (proxy chỉ là tiện lợi). */
export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-in">
          <Link href="/" className="logo">
            <span className="logo-mark" aria-hidden="true">Aa</span>
            Web học từ vựng
          </Link>
          <TopNav />
          <ThemeButton />
          <PetButton />
          <MuteButton />
        </div>
      </header>
      <PetBackground />
      {children}
      <TabBar />
    </div>
  );
}
