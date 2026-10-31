import Link from "next/link";
import { notFound } from "next/navigation";
import { isServiceError } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import { getResultDetail } from "@/server/services";
import { resultRefSchema } from "@/types/api";
import { ResultReview } from "./ResultReview";

export const metadata = { title: "Xem lại bài · Web học từ vựng" };
export const dynamic = "force-dynamic";

export default async function ResultDetailPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  const ref = resultRefSchema.safeParse(await params);
  if (!ref.success) notFound();

  const user = await requireUser();
  try {
    const detail = await getResultDetail(user.id, ref.data);
    return (
      <main className="page page-narrow">
        <Link href="/results" className="back">‹ Kết quả</Link>
        <ResultReview detail={detail} />
      </main>
    );
  } catch (e) {
    if (isServiceError(e) && e.status === 404) notFound(); // bài không tồn tại hoặc của người khác: không phân biệt
    if (isServiceError(e) && e.code === "NO_DETAIL") {
      return (
        <main className="page page-narrow">
          <Link href="/results" className="back">‹ Kết quả</Link>
          <div className="sheet sheet-plain state">
            <div className="big" aria-hidden="true">🗂️</div>
            <h2>Không có chi tiết bài làm</h2>
            <p className="muted">Bài này làm trước khi có tính năng xem lại (hoặc bị đóng vì hết giờ), nên chỉ còn điểm số.</p>
            <Link href="/results" className="btn">Về danh sách</Link>
          </div>
        </main>
      );
    }
    throw e;
  }
}
