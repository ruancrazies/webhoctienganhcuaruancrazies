import Link from "next/link";

/** Thanh chuyển hai mục của tab Học: Hôm nay (/) và Năng lực (/insights). */
export function LearnTabs({ active }: { active: "today" | "insights" }) {
  return (
    <nav className="scope" aria-label="Mục của tab Học">
      <Link href="/" className="pill" aria-current={active === "today" ? "page" : undefined}>Hôm nay</Link>
      <Link href="/insights" className="pill" aria-current={active === "insights" ? "page" : undefined}>Năng lực</Link>
    </nav>
  );
}
