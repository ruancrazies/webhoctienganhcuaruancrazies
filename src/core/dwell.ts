import { clampResponseMs } from "./events";

/**
 * Đo thời gian MỖI CÂU HIỆN TRÊN MÀN HÌNH (cho `responseMs`). Hàm thuần: đồng hồ do bên ngoài đưa vào để test được.
 *
 *  - `show(key)`      : câu `key` vừa hiện (câu trước tự dừng). `null` = không câu nào hiện.
 *  - `setVisible(v)`  : tab ẩn → dừng đồng hồ, tab hiện lại → chạy tiếp (không tính thời gian bỏ tab).
 *  - `ms(key)`        : tổng thời gian câu đó đã hiện (cộng dồn qua các lần quay lại — bài thi cho đi lại giữa các câu),
 *                       đã kẹp 0–120.000; `undefined` nếu câu chưa từng hiện trong phiên trang này
 *                       (ví dụ trả lời trước khi tải lại trang) — thiếu dữ liệu tốt hơn là báo 0.
 */
export class DwellTracker {
  private acc = new Map<string, number>();
  private cur: string | null = null;
  private since: number | null = null;
  private visible = true;

  constructor(private readonly now: () => number) {}

  private flush(): void {
    if (this.cur !== null && this.since !== null) {
      const t = this.now();
      this.acc.set(this.cur, (this.acc.get(this.cur) ?? 0) + (t - this.since));
      this.since = t;
    }
  }

  show(key: string | null): void {
    this.flush();
    this.cur = key;
    if (key !== null && !this.acc.has(key)) this.acc.set(key, 0);
    this.since = key !== null && this.visible ? this.now() : null;
  }

  setVisible(v: boolean): void {
    if (v === this.visible) return;
    this.flush();
    this.visible = v;
    this.since = v && this.cur !== null ? this.now() : null;
  }

  ms(key: string): number | undefined {
    this.flush();
    const t = this.acc.get(key);
    return t === undefined ? undefined : clampResponseMs(t);
  }
}
