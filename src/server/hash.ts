import { createHash } from "node:crypto";

/** Băm ngắn để làm khóa giới hạn tần suất mà không lưu email/tên đăng nhập dạng rõ. */
export const keyHash = (s: string): string =>
  createHash("sha256").update(s.trim().toLowerCase()).digest("hex").slice(0, 32);
