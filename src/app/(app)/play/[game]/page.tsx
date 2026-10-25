import Link from "next/link";
import { notFound } from "next/navigation";
import { GameRunner } from "@/games/shell/GameRunner";
import { gameById } from "@/games/registry";
import { isCefr } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getHome } from "@/server/services";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const DOMAIN_RE = /^[a-z0-9_]{1,40}$/;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  return { title: `${gameById(game)?.name ?? "Trò chơi"} · Web học từ vựng` };
}

/** Trang chơi: /play/<trò>?cefr=A1&domain=general hoặc &topic=<slug>. Việc tạo vòng và chấm điểm do API lo. */
export default async function PlayPage({ params, searchParams }: { params: Promise<{ game: string }>; searchParams: Promise<SearchParams> }) {
  const { game: rawGame } = await params;
  const sp = await searchParams;

  const meta = gameById(rawGame);
  if (!meta) notFound();

  const cefr = (first(sp.cefr) ?? "").toUpperCase();
  if (!isCefr(cefr)) notFound();

  const topic = first(sp.topic) || undefined;
  const domainRaw = first(sp.domain) || "all";
  if (topic !== undefined && topic.length > 80) notFound();
  if (domainRaw !== "all" && !DOMAIN_RE.test(domainRaw)) notFound();
  const domain = domainRaw;

  const user = await requireUser();
  const home = await getHome(user.id);
  const level = home.levels.find((l) => l.cefr === cefr);
  if (!level) notFound();

  if (!level.unlocked) {
    return (
      <main className="page page-narrow">
        <Link href="/" className="back">‹ Trang chủ</Link>
        <div className="sheet sheet-plain state">
          <div className="big" aria-hidden="true">🔒</div>
          <h2>Cấp {cefr} đang khóa</h2>
          <p className="muted">Bạn cần đạt bài kiểm tra của cấp trước để chơi ở cấp này.</p>
          <Link href="/" className="btn">Về trang chủ</Link>
        </div>
      </main>
    );
  }

  if (!meta.ready) {
    return (
      <main className="page page-narrow">
        <Link href={`/level/${cefr}`} className="back">‹ Cấp {cefr}</Link>
        <div className="sheet sheet-plain state">
          <div className="big" aria-hidden="true">🛠️</div>
          <h2>{meta.name} sắp ra mắt</h2>
          <p className="muted">Trò này chưa sẵn sàng. Hãy thử một trò khác.</p>
          <Link href={`/level/${cefr}`} className="btn">Chọn trò khác</Link>
        </div>
      </main>
    );
  }

  if (meta.levelOnly && topic) {
    return (
      <main className="page page-narrow">
        <Link href={`/level/${cefr}`} className="back">‹ Cấp {cefr}</Link>
        <div className="sheet sheet-plain state">
          <div className="big" aria-hidden="true">{meta.emoji}</div>
          <h2>{meta.name} chỉ chơi theo cấp</h2>
          <p className="muted">Trò này không chơi theo chủ đề. Hãy chọn “Tất cả” hoặc một lĩnh vực ở trang cấp.</p>
          <Link href={`/level/${cefr}`} className="btn">Về cấp {cefr}</Link>
        </div>
      </main>
    );
  }

  const label = topic
    ? (level.topics.find((t) => t.slug === topic)?.title ?? topic)
    : domain === "all"
      ? "Tất cả lĩnh vực"
      : (level.domains.find((d) => d.code === domain)?.title ?? domain);

  return (
    <main className="page page-narrow">
      <GameRunner game={meta.id} scope={{ cefr, ...(topic ? { topic } : { domain }) }} label={label} />
    </main>
  );
}
