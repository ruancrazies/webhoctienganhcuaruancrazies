/** Luật mở khóa (kiểu hợp). Giai đoạn 2 thêm hàm kiểm cho từng loại; giai đoạn 0 chỉ khai báo kiểu. */
export type Unlock =
  | { type: "default" } // ai cũng có
  | { type: "level"; level: number } // đủ Level thì cấp vĩnh viễn
  | { type: "event"; event: string } // nhận trong khoảng một sự kiện
  | { type: "grant" }; // admin tặng hoặc phần thưởng

/** Chữ thường, số, gạch ngang; 2–24 ký tự (profiles.avatar giới hạn 32), bắt đầu bằng chữ cái. */
export const ID_RE = /^[a-z][a-z0-9-]{1,23}$/;

export function assertId(kind: string, id: string): void {
  if (!ID_RE.test(id)) throw new Error(`${kind}: id "${id}" không hợp lệ (chữ thường, số, gạch ngang; 2–24 ký tự; bắt đầu bằng chữ cái)`);
}
