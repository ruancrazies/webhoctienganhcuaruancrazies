import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import type { Db } from "../../scripts/content/lib/db";

const ROOT = path.join(__dirname, "..", "..");

/** Phần của Supabase mà migrations dựa vào (auth.users, auth.uid(), các role). */
const SUPABASE_STUB = `
create schema if not exists auth;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
`;

type Queryable = Pick<PGlite, "query"> | Transaction;

function wrap(q: Queryable, root: PGlite): Db {
  return {
    query: async <T extends object>(sql: string, params?: unknown[]) => {
      const r = await q.query<T>(sql, params as unknown[]);
      return { rows: r.rows };
    },
    transaction: async <T>(fn: (tx: Db) => Promise<T>) =>
      root.transaction(async (tx) => fn(wrap(tx, root))),
    close: async () => {},
  };
}

export function pgliteDb(p: PGlite): Db {
  return { ...wrap(p, p), close: () => p.close() };
}

/** PGlite mới + stub Supabase + chạy toàn bộ supabase/migrations/*.sql theo thứ tự. */
export async function freshDb(): Promise<{ pg: PGlite; db: Db }> {
  const pg = new PGlite({ extensions: { pg_trgm } });
  await pg.exec(SUPABASE_STUB);
  const dir = path.join(ROOT, "supabase", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    try {
      await pg.exec(readFileSync(path.join(dir, f), "utf8"));
    } catch (e) {
      throw new Error(`Migration ${f} lỗi: ${(e as Error).message}`);
    }
  }
  return { pg, db: pgliteDb(pg) };
}
