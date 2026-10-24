import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page page-narrow">
      <div className="sheet sheet-plain state">
        <div className="big" aria-hidden="true">🔍</div>
        <h2>Không tìm thấy trang</h2>
        <p className="muted">Đường dẫn này không tồn tại hoặc đã đổi.</p>
        <Link href="/" className="btn">Về trang chủ</Link>
      </div>
    </main>
  );
}
