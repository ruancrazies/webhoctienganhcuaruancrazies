/**
 * Chờ `p` tối đa `ms` mili giây; quá hạn thì trả `fallback` (không ném). `p` vẫn chạy tiếp ở nền và lỗi của nó bị nuốt,
 * nên lệnh gọi chậm không làm sập tiến trình. Dùng cho thứ "có thì tốt" nằm trên đường vẽ trang (vd cấu hình Scene đăng nhập).
 */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
