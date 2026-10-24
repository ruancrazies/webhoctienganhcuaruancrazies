"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page page-narrow">
      <div className="sheet sheet-plain state" role="alert">
        <div className="big" aria-hidden="true">😵</div>
        <h2>Không tải được trang</h2>
        <p className="muted">Máy chủ đang gặp lỗi hoặc mạng không ổn định. Thử lại sau vài giây.</p>
        {process.env.NODE_ENV !== "production" ? <p className="small muted">{error.message}</p> : null}
        <button type="button" className="btn" onClick={reset}>Thử lại</button>
      </div>
    </main>
  );
}
