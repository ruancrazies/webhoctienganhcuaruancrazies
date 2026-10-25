"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const ICONS: Record<string, ReactNode> = {
  home: <Svg><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /><path d="M10 19.5v-5h4v5" /></Svg>,
  quests: <Svg><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></Svg>,
  rank: <Svg><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5v1.5A3 3 0 0 0 8 10.5M16 6h3v1.5a3 3 0 0 1-3 3" /><path d="M12 13v4M8.5 20h7" /></Svg>,
  me: <Svg><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></Svg>,
};

const TABS = [
  { href: "/", label: "Trang chủ", icon: "home", match: (p: string) => p === "/" || /^\/(level|learn|exam|play)(\/|$)/.test(p) },
  { href: "/quests", label: "Nhiệm vụ", icon: "quests", match: (p: string) => p.startsWith("/quests") },
  { href: "/leaderboard", label: "Xếp hạng", icon: "rank", match: (p: string) => p.startsWith("/leaderboard") },
  { href: "/profile", label: "Hồ sơ", icon: "me", match: (p: string) => p.startsWith("/profile") },
];

export function TopNav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Điều hướng chính">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.match(path) ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Thanh điều hướng dưới (điện thoại). Ẩn khi đang làm bài thi / chơi để không bấm nhầm. */
export function TabBar() {
  const path = usePathname();
  if (/^\/(exam|play)\//.test(path)) return null;
  return (
    <nav className="tabbar" aria-label="Điều hướng chính">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.match(path) ? "page" : undefined}>
          <span className="ti" aria-hidden="true">{ICONS[t.icon]}</span>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
