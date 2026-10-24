import { existsSync } from "node:fs";

/** Nạp .env.local / .env (nếu có) vào process.env. Biến đã đặt sẵn không bị ghi đè. */
export function loadEnv(): void {
  for (const f of [".env.local", ".env"]) {
    if (existsSync(f)) {
      try {
        process.loadEnvFile(f);
      } catch {
        /* file lỗi định dạng: bỏ qua, các biến cần thiết sẽ báo thiếu ở nơi dùng */
      }
    }
  }
}
