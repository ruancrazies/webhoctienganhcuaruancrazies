import "server-only";
import { createAdminClient } from "./db";

/**
 * Giới hạn tần suất, đếm trong Postgres (ADR-9). Trả true nếu CÒN được phép.
 * Lỗi DB thì ném lỗi (đóng cửa): các hàm gọi quyết định báo gì cho người dùng.
 */
export async function hitRateLimit(key: string, windowSeconds: number, max: number): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("hit_rate_limit", {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  if (error) throw new Error(`hit_rate_limit: ${error.message}`);
  return data === true;
}
