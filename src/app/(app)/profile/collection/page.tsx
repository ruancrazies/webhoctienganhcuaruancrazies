import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { COSMETIC_KINDS, matchesFilter, type CollectionFilter, type CosmeticKind } from "@/core/cosmetics";
import { themeCss } from "@/cosmetics/core/css";
import { RARITY_LABEL, THEME_GROUP_LABEL } from "@/cosmetics/core/define";
import { THEMES } from "@/cosmetics/registry";
import { expiryText, stateText } from "@/lib/cosmeticText";
import { requireUser } from "@/server/auth/session";
import { getCollection, type CollectionItem } from "@/server/services";
import { CollectionGrid, type GridItem } from "./CollectionGrid";

export const metadata = { title: "Bộ sưu tập · Web học từ vựng" };
export const dynamic = "force-dynamic";

const TAB_LABEL: Record<CosmeticKind, string> = { theme: "Giao diện", avatar: "Avatar", frame: "Khung" };
const FILTERS: { id: CollectionFilter; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "owned", label: "Đã có" },
  { id: "locked", label: "Chưa mở" },
  { id: "event", label: "Sự kiện" },
];
const EMPTY: Record<CosmeticKind, string> = {
  theme: "Chưa có giao diện nào ở mục này.",
  avatar: "Bộ avatar minh họa sắp ra mắt. Avatar hiện tại của bạn vẫn giữ nguyên.",
  frame: "Chưa có khung nào. Khung sẽ xuất hiện trong các sự kiện.",
};

function pick<T extends string>(v: string | string[] | undefined, allowed: readonly T[], fallback: T): T {
  const s = Array.isArray(v) ? v[0] : v;
  return allowed.find((a) => a === s) ?? fallback;
}

export default async function CollectionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const kind = pick<CosmeticKind>(sp.tab, COSMETIC_KINDS, "theme");
  const filter = pick<CollectionFilter>(sp.f, FILTERS.map((f) => f.id), "all");

  const col = await getCollection(user.id).catch(() => null);
  if (!col) notFound();
  const inTab = col.items.filter((i) => i.kind === kind);
  const shown = inTab.filter((i) => matchesFilter(i.state, i.event !== null, filter));
  const owned = (k: CosmeticKind) => col.items.filter((i) => i.kind === k && i.state.status === "owned");

  const gridItems: GridItem[] = shown.map((i) => toGridItem(i, col.look, col.username, new Map(Object.entries(col.eventNames))));
  const q = (tab: CosmeticKind, f: CollectionFilter) => `/profile/collection?tab=${tab}${f === "all" ? "" : `&f=${f}`}`;

  return (
    <main className="page">
      {kind === "theme"
        ? // CSS của mọi theme chỉ nạp ở màn này: để xem trước từng ô và dùng thử cả trang (giới hạn bởi [data-theme=id]).
          THEMES.map((t) => <style key={t.id} data-theme-css={t.id} dangerouslySetInnerHTML={{ __html: themeCss(t) }} />)
        : null}

      <p><Link href="/profile" className="back">‹ Tôi</Link></p>
      <header className="stack" style={{ gap: 4 }}>
        <h1>Bộ sưu tập</h1>
        <p className="muted">Level {col.level} · đã có {owned("theme").length} giao diện, {owned("avatar").length} avatar, {owned("frame").length} khung.</p>
      </header>

      <nav className="scope" aria-label="Loại">
        {COSMETIC_KINDS.map((k) => (
          <Link key={k} href={q(k, "all")} className="pill" aria-current={k === kind ? "page" : undefined}>
            {TAB_LABEL[k]}
            {col.items.some((i) => i.kind === k) ? <span className="cos-cnt"> {owned(k).length}/{col.items.filter((i) => i.kind === k).length}</span> : null}
          </Link>
        ))}
      </nav>
      <nav className="scope" aria-label="Lọc">
        {FILTERS.map((f) => (
          <Link key={f.id} href={q(kind, f.id)} className="pill" aria-current={f.id === filter ? "page" : undefined}>{f.label}</Link>
        ))}
      </nav>

      {kind === "theme" && col.look.auto ? <p className="small">Đang bật “Tự động theo thiết bị”. Chọn một giao diện bên dưới để tắt.</p> : null}

      {gridItems.length ? (
        <CollectionGrid kind={kind} items={gridItems} canReset={kind === "avatar" ? col.look.avatar !== null : kind === "frame" ? col.look.frame !== null : false} />
      ) : (
        <div className="state sheet sheet-plain">
          <p>{inTab.length ? "Không có món nào trong mục này." : EMPTY[kind]}</p>
          {inTab.length ? <Link href={q(kind, "all")} className="btn btn-light btn-sm">Xem tất cả</Link> : null}
        </div>
      )}
    </main>
  );
}

function toGridItem(i: CollectionItem, look: { avatar: string | null; frame: string | null }, username: string, eventNames: ReadonlyMap<string, string>): GridItem {
  const s = i.state;
  const usable = s.status === "owned";
  const locked = s.status === "locked" || s.status === "expired";
  const acquire = s.status === "locked" ? s.acquire : s.status === "expired" ? s.acquire : null;
  return {
    id: i.id,
    name: i.name,
    rarity: i.rarity ? RARITY_LABEL[i.rarity] : null,
    tag: i.group ? THEME_GROUP_LABEL[i.group] : i.series,
    isNew: s.status === "owned" && s.isNew,
    equipped: i.equipped,
    usable,
    expiry: expiryText(s),
    expired: s.status === "expired",
    status: stateText(s, eventNames),
    link: i.event !== null && eventNames.has(i.event) && (s.status === "locked" || s.status === "expired") ? { href: "/quests?tab=events", label: "Xem sự kiện" } : null,
    progress: locked && acquire?.type === "level" && !acquire.reached ? acquire.ratio : null,
    art:
      i.kind === "theme" ? (
        <div className="cos-theme" data-theme={i.id}>
          <b aria-hidden="true">Aa</b>
          <span className="bar bar-mark" aria-hidden="true"><i style={{ width: "60%" }} /></span>
          <span className="cos-sw" aria-hidden="true"><i className="sw-accent" /><i className="sw-mark" /><i className="sw-danger" /><i className="sw-success" /></span>
        </div>
      ) : i.kind === "avatar" ? (
        <Avatar avatar={i.id} frame={look.frame} username={username} />
      ) : (
        <Avatar avatar={look.avatar} frame={i.id} username={username} />
      ),
  };
}
