/** Đọc biến môi trường phía server, báo lỗi rõ ràng khi thiếu (đọc lười: không làm hỏng build). */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường ${name} (xem .env.example)`);
  return v;
}

export const optionalEnv = (name: string): string | undefined => process.env[name] || undefined;
