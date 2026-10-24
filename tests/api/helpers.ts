import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

/** Nạp .env.local (không ghi đè biến đã có) — vitest không tự nạp. */
export function loadEnv(): void {
  try {
    const text = readFileSync(path.join(__dirname, "..", "..", ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* không có .env.local: dựa vào biến môi trường */
  }
}

export function requireLocalEnv(): { dbUrl: string } {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const dbUrl = process.env.DATABASE_URL_LOCAL;
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY || !dbUrl) {
    throw new Error("Thiếu NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DATABASE_URL_LOCAL (xem .env.local).");
  }
  // Test GHI và XÓA dữ liệu: chỉ chạy trên máy này.
  const hostOk = (u: string) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(u).hostname);
  if (!hostOk(url) || !hostOk(dbUrl.replace(/^postgres(ql)?:/, "http:"))) {
    throw new Error(`Từ chối chạy: Supabase/DB không phải localhost (${url}). Test tích hợp chỉ dành cho Supabase local.`);
  }
  return { dbUrl };
}

export const makePool = (dbUrl: string) => new Pool({ connectionString: dbUrl, max: 4 });
