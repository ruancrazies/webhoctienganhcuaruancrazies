import Link from "next/link";
import { notFound } from "next/navigation";
import { LevelScopePicker } from "./LevelScopePicker";
import { LEVEL_NAMES, fmtNumber, isCefr, prevLevel, ratio } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getHome } from "@/server/services";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ cefr: string }> }) {
  const { cefr } = await params;
  return { title: `Cấp ${cefr.toUpperCase()} · Web học từ vựng` };
}

export default async function LevelPage({ params }: { params: Promise<{ cefr: string }> }) {
  const { cefr: raw } = await params;
  const cefr = raw.toUpperCase();
  if (!isCefr(cefr)) notFound();

  const user = await requireUser();
  const home = await getHome(user.id);
  const level = home.levels.find((l) => l.cefr === cefr);
  if (!level) notFound();

  if (!level.unlocked) {
    const prev = prevLevel(cefr);
    return (
      <main className="page page-narrow">
        <Link href="/" className="back">‹ Trang chủ</Link>
        <div className="sheet sheet-plain state">
          <div className="big" aria-hidden="true">🔒</div>
          <h2>Cấp {cefr} đang khóa</h2>
          <p className="muted">Bạn cần đạt bài kiểm tra cấp {prev ?? "trước"} để mở cấp này. Không thể thi nhảy cấp.</p>
          <Link href={prev ? `/level/${prev}` : "/"} className="btn">Về cấp {prev ?? "đầu"}</Link>
        </div>
      </main>
    );
  }

  const missing = Math.max(0, level.needLearned - level.learnedCum);
  const hasExam = cefr !== "C2";
  const learnedRatio = ratio(level.learned, level.total);

  return (
    <main className="page">
      <Link href="/" className="back">‹ Trang chủ</Link>

      <section className="lvhead" aria-labelledby="lv-h">
        <span className="big" aria-hidden="true">{cefr}</span>
        <div className="stack" style={{ gap: 8 }}>
          <h1 id="lv-h">Cấp {cefr}: {LEVEL_NAMES[cefr]}</h1>
          <div className="bar" role="img" aria-label={`Đã học ${level.learned} trên ${level.total} từ`}>
            <i style={{ width: `${learnedRatio * 100}%` }} />
          </div>
          <p className="muted">
            Đã học {fmtNumber(level.learned)}/{fmtNumber(level.total)} từ, đã thuộc {fmtNumber(level.mastered)}
          </p>
        </div>
      </section>

      {hasExam ? (
        <section className="sheet" aria-labelledby="ex-h">
          <div className="spread">
            <div className="stack" style={{ gap: 4 }}>
              <h2 id="ex-h">Bài kiểm tra lên cấp</h2>
              {level.pass ? (
                <p className="muted">Bạn đã qua cấp {cefr}.</p>
              ) : level.eligible ? (
                <p className="muted">Bạn đủ điều kiện thi cấp {cefr}.</p>
              ) : (
                <p className="muted">
                  Học thêm {fmtNumber(missing)} từ nữa mới được thi (đã học {fmtNumber(level.learnedCum)}/{fmtNumber(level.needLearned)} từ tính từ A1).
                </p>
              )}
            </div>
            {level.pass ? <span className="chip chip-good">✓ Đã qua</span> : (
              <Link href={`/exam/${cefr}`} className={level.eligible ? "btn btn-mark" : "btn btn-light"}>
                {level.eligible ? "Thi ngay" : "Xem điều kiện"}
              </Link>
            )}
          </div>
        </section>
      ) : (
        <section className="sheet sheet-plain">
          <p className="muted">C2 là cấp cuối của lộ trình: không có bài kiểm tra. Cứ học và chơi thoải mái.</p>
        </section>
      )}

      <LevelScopePicker cefr={cefr} domains={level.domains} topics={level.topics} />
    </main>
  );
}
