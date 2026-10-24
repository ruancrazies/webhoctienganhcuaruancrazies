export default function Loading() {
  return (
    <main className="page" aria-busy="true" aria-label="Đang tải">
      <div className="skeleton" style={{ height: 36, width: "55%" }} />
      <div className="skeleton" style={{ height: 84 }} />
      <div className="skeleton" style={{ height: 260 }} />
    </main>
  );
}
