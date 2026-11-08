"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/** Bốn tab, mỗi thứ chỉ nằm ở một nơi. URL cũ giữ nguyên; chỉ đổi nơi sắp xếp: /insights thuộc tab Học, /results thuộc tab Tôi. */
const TABS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: "/", label: "Học", icon: "book", match: (p) => p === "/" || /^\/(level|learn|exam|play|insights)(\/|$)/.test(p) },
  { href: "/quests", label: "Nhiệm vụ", icon: "target", match: (p) => p.startsWith("/quests") },
  { href: "/leaderboard", label: "Xếp hạng", icon: "trophy", match: (p) => p.startsWith("/leaderboard") },
  { href: "/profile", label: "Tôi", icon: "user", match: (p) => /^\/(profile|results)(\/|$)/.test(p) },
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

/** Thanh điều hướng dưới (điện thoại). Ẩn khi đang làm bài thi / chơi để không bấm nhầm. Tab Tôi hiện avatar của người dùng. */
export function TabBar({ me }: { me?: ReactNode }) {
  const path = usePathname();
  if (/^\/(exam|play)\//.test(path)) return null;
  return (
    <nav className="tabbar" aria-label="Điều hướng chính">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.match(path) ? "page" : undefined}>
          <span className="ti" aria-hidden="true">{t.href === "/profile" && me ? me : <Icon name={t.icon} size={22} />}</span>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
