import Link from "next/link";

export const metadata = { title: "Quản trị · Web học từ vựng" };
export const dynamic = "force-dynamic";

export default function AdminHome() {
  return (
    <main className="page page-narrow">
      <header className="stack" style={{ gap: 6 }}>
        <h1>Quản trị</h1>
        <p className="muted">Khu vực chỉ dành cho admin.</p>
      </header>
      <section className="sheet stack" aria-labelledby="sc-h">
        <h2 id="sc-h">Scene đăng nhập</h2>
        <p className="muted">Chọn, đặt lịch và xem trước giao diện đăng nhập theo mùa (Halloween, Giáng sinh…).</p>
        <div><Link href="/admin/scenes" className="btn btn-sm">Quản lý Scene</Link></div>
      </section>
      <section className="sheet stack" aria-labelledby="gal-h">
        <h2 id="gal-h">Gallery</h2>
        <p className="muted">Xem mọi theme, avatar, khung cạnh nhau kèm kết quả kiểm tự động trước khi bật cho người dùng.</p>
        <div><Link href="/admin/gallery" className="btn btn-sm">Mở gallery</Link></div>
      </section>
    </main>
  );
}
