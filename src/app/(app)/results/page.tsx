import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { listResults } from "@/server/services";
import { resultsQuerySchema } from "@/types/api";
import { ResultsList } from "./ResultsList";

export const metadata = { title: "Kết quả bài kiểm tra · Web học từ vựng" };
export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  const user = await requireUser();
  const initial = await listResults(user.id, resultsQuerySchema.parse({}));
  return (
    <main className="page page-narrow">
      <Link href="/profile" className="back">‹ Hồ sơ</Link>
      <header className="stack" style={{ gap: 6 }}>
        <h1>Kết quả bài kiểm tra</h1>
        <p className="muted">Các bài thi lên cấp và bài kiểm tra bạn đã nộp. Mở lại để xem đáp án của bạn và đáp án đúng.</p>
      </header>
      <ResultsList initial={initial} />
    </main>
  );
}
