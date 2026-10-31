"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Trang chủ", icon: "🏠", match: (p: string) => p === "/" || /^\/(level|learn|exam|play)(\/|$)/.test(p) },
  { href: "/quests", label: "Nhiệm vụ", icon: "🎯", match: (p: string) => p.startsWith("/quests") },
  { href: "/leaderboard", label: "Xếp hạng", icon: "🏆", match: (p: string) => p.startsWith("/leaderboard") },
  { href: "/profile", label: "Hồ sơ", icon: "👤", match: (p: string) => /^\/(profile|results)(\/|$)/.test(p) },
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
          <span className="ti" aria-hidden="true">{t.icon}</span>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
