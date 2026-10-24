import pg from "pg";

/**
 * Giao diện tối thiểu để sync/export chạy được trên node-postgres (thật) lẫn PGlite (test).
 * Lưu ý: với node-postgres, cột bigint trả về chuỗi — ép kiểu ::int trong SQL khi cần số.
 */
export interface Db {
  query<T extends object = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function connectPg(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 2 });
  const wrap = (c: pg.Pool | pg.PoolClient): Omit<Db, "transaction" | "close"> => ({
    query: async <T extends object>(sql: string, params?: unknown[]) => {
      const r = await c.query(sql, params as unknown[]);
      return { rows: r.rows as T[] };
    },
  });
  return {
    ...wrap(pool),
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      const tx: Db = {
        ...wrap(client),
        transaction: (inner) => inner(tx), // đã trong giao dịch
        close: async () => {},
      };
      try {
        await client.query("begin");
        const out = await fn(tx);
        await client.query("commit");
        return out;
      } catch (e) {
        await client.query("rollback").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export const DEFAULT_LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Chọn chuỗi kết nối theo môi trường: DATABASE_URL_LOCAL / _STAGING / _PROD (local có mặc định của supabase CLI). */
export function resolveDatabaseUrl(target: string): string {
  const t = target.toLowerCase();
  if (!["local", "staging", "prod"].includes(t)) throw new Error(`--target phải là local | staging | prod (nhận "${target}")`);
  const url = process.env[`DATABASE_URL_${t.toUpperCase()}`]?.trim() || (t === "local" ? DEFAULT_LOCAL_URL : "");
  if (!url) throw new Error(`Chưa đặt DATABASE_URL_${t.toUpperCase()} trong .env.local (chuỗi kết nối Postgres trực tiếp của Supabase).`);
  return url;
}
