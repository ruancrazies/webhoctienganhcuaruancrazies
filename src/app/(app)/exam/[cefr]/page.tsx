import Link from "next/link";
import { notFound } from "next/navigation";
import { ExamRunner, type ExamInfo } from "./ExamRunner";
import { isCefr, nextLevel } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getConfig } from "@/server/config";
import { getHome } from "@/server/services";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ cefr: string }> }) {
  const { cefr } = await params;
  return { title: `Thi lên cấp ${cefr.toUpperCase()} · Web học từ vựng` };
}

export default async function ExamPage({ params }: { params: Promise<{ cefr: string }> }) {
  const { cefr: raw } = await params;
  const cefr = raw.toUpperCase();
  if (!isCefr(cefr)) notFound();

  const user = await requireUser();
  const home = await getHome(user.id);
  const level = home.levels.find((l) => l.cefr === cefr);
  if (!level) notFound();

  if (cefr === "C2") {
    return (
      <main className="page page-narrow">
        <Link href="/level/C2" className="back">‹ Cấp C2</Link>
        <div className="sheet sheet-plain state">
          <div className="big" aria-hidden="true">🎓</div>
          <h2>C2 không có bài kiểm tra</h2>
          <p className="muted">Hoàn thành bài thi C1 là hết lộ trình. C2 để bạn học thêm cho thoải mái.</p>
        </div>
      </main>
    );
  }

  const c = getConfig().exam;
  const info: ExamInfo = {
    vocabTotal: c.vocab.total,
    grammarTotal: c.grammar.total,
    durationMinutes: c.durationMinutes,
    passTotal: c.passTotal,
    passPart: c.passPart,
    cooldownMinutes: c.cooldownMinutes,
    maxAttemptsPerDay: c.maxAttemptsPerDay,
  };

  return (
    <main className="page page-narrow">
      <ExamRunner
        cefr={cefr}
        info={info}
        next={nextLevel(cefr)}
        gate={{ unlocked: level.unlocked, pass: level.pass, eligible: level.eligible, learnedCum: level.learnedCum, needLearned: level.needLearned }}
      />
    </main>
  );
}
