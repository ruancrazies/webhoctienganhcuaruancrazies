import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { getPracticeOverview } from "@/server/services";
import { TestRunner } from "./TestRunner";

export const metadata = { title: "Kiểm tra · Web học từ vựng" };
export const dynamic = "force-dynamic";

export default async function TestPage() {
  const user = await requireUser();
  const overview = await getPracticeOverview(user.id);
  return (
    <main className="page page-narrow">
      <Link href="/quests" className="back">‹ Nhiệm vụ</Link>
      <header className="stack" style={{ gap: 6 }}>
        <h1>Kiểm tra</h1>
        <p className="muted">Kiểm tra xem bạn còn nhớ bao nhiêu trong số những từ đã học. <Link href="/results">Xem lại các bài đã làm</Link>.</p>
      </header>
      <TestRunner overview={overview} />
    </main>
  );
}
