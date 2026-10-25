import Link from "next/link";
import { notFound } from "next/navigation";
import { LearnList } from "./LearnList";
import { LEVEL_NAMES, isCefr } from "@/lib/format";
import { learnHref } from "@/games/registry";
import { requireUser } from "@/server/auth/session";
import { getHome } from "@/server/services";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ cefr: string }> }) {
  const { cefr } = await params;
  return { title: `Học từ vựng ${cefr.toUpperCase()} · Web học từ vựng` };
}

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LearnPage({ params, searchParams }: { params: Promise<{ cefr: string }>; searchParams: SP }) {
  const { cefr: raw } = await params;
  const cefr = raw.toUpperCase();
  if (!isCefr(cefr)) notFound();
  const sp = await searchParams;
  const topic = one(sp.topic);
  const domain = one(sp.domain) ?? "all";
  if (domain !== "all" && !/^[a-z0-9_]{1,40}$/.test(domain)) notFound();
  const mode = one(sp.mode) === "review" ? "review" : "new";

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
          <p className="muted">Đạt bài kiểm tra cấp trước để mở cấp này.</p>
          <Link href="/" className="btn">Về trang chủ</Link>
        </div>
      </main>
    );
  }

  const topicInfo = topic ? level.topics.find((t) => t.slug === topic) : undefined;
  if (topic && !topicInfo) notFound();
  const domainInfo = !topic && domain !== "all" ? level.domains.find((d) => d.code === domain) : undefined;
  const scopeLabel = topicInfo ? `Chủ đề: ${topicInfo.title}` : domainInfo ? domainInfo.title : "Tất cả lĩnh vực";

  const hrefScope = topic ? { cefr, topic } : { cefr, domain };

  return (
    <main className="page page-narrow">
      <Link href={`/level/${cefr}`} className="back">‹ Cấp {cefr}</Link>
      <header className="stack" style={{ gap: 6 }}>
        <h1>{mode === "review" ? "Ôn lại từ cũ" : "Học từ mới"} {cefr}</h1>
        <p className="muted">
          {LEVEL_NAMES[cefr]}, {scopeLabel}
        </p>
      </header>
      <nav className="scope" aria-label="Chế độ học">
        <Link href={learnHref(hrefScope, "new")} className="pill" aria-current={mode === "new" ? "page" : undefined} replace>
          🌱 Học từ mới
        </Link>
        <Link href={learnHref(hrefScope, "review")} className="pill" aria-current={mode === "review" ? "page" : undefined} replace>
          🔁 Ôn lại từ cũ
        </Link>
      </nav>
      <LearnList key={`${cefr}|${topic ?? ""}|${domain}|${mode}`} cefr={cefr} topic={topic} domain={domain} mode={mode} />
    </main>
  );
}
