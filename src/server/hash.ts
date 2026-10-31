import { createHash } from "node:crypto";

/** Băm ngắn để làm khóa giới hạn tần suất mà không lưu email/tên đăng nhập dạng rõ. */
export const keyHash = (s: string): string =>
  createHash("sha256").update(s.trim().toLowerCase()).digest("hex").slice(0, 32);

/** sha256 đầy đủ (64 ký tự hex), dùng làm khoá cache dùng chung. Không chuẩn hoá chữ hoa/thường: người gọi tự chuẩn hoá. */
export const sha256Hex = (s: string): string => createHash("sha256").update(s).digest("hex");
