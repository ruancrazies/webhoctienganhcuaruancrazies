import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./helpers";

/** Giai đoạn 3 (migration 0015): coach_messages và error_explanations — khoá, ràng buộc, quyền, xoá tài khoản. */

let pg: PGlite;
const U1 = "11111111-1111-1111-1111-111111111111";
const KEY = "a".repeat(64);

const ins = (sql: string, params: unknown[] = []) => pg.query(sql, params);
const as = async (role: string, sql: string, params: unknown[] = []) => {
  await pg.exec(`set role ${role}`);
  try {
    return await pg.query(sql, params);
  } finally {
    await pg.exec("reset role");
  }
};

beforeAll(async () => {
  ({ pg } = await freshDb());
  await pg.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${U1}', 'a@x.vn', '{"username":"Alice_01"}')`);
}, 60000);
afterAll(() => pg.close());

describe("coach_messages", () => {
  it("mỗi người một dòng mỗi ngày; ghi đè theo (user, day)", async () => {
    await ins(`insert into coach_messages (user_id, day, message, source, fingerprint) values ($1, 100, 'm1', 'ai', 'fp1')`, [U1]);
    await ins(
      `insert into coach_messages (user_id, day, message, source, fingerprint) values ($1, 100, 'm2', 'ai', 'fp2')
       on conflict (user_id, day) do update set message = excluded.message, fingerprint = excluded.fingerprint`,
      [U1],
    );
    const r = await pg.query<{ message: string; fingerprint: string }>(`select message, fingerprint from coach_messages where user_id = $1 and day = 100`, [U1]);
    expect(r.rows).toEqual([{ message: "m2", fingerprint: "fp2" }]);
  });

  it("ràng buộc: source chỉ ai/rule, message không rỗng và không quá 600", async () => {
    await expect(ins(`insert into coach_messages (user_id, day, message, source) values ($1, 101, 'x', 'llm')`, [U1])).rejects.toThrow();
    await expect(ins(`insert into coach_messages (user_id, day, message, source) values ($1, 101, '', 'ai')`, [U1])).rejects.toThrow();
    await expect(ins(`insert into coach_messages (user_id, day, message, source) values ($1, 101, $2, 'ai')`, [U1, "x".repeat(601)])).rejects.toThrow();
  });

  it("người dùng không tồn tại → bị chặn bởi khoá ngoại", async () => {
    await expect(ins(`insert into coach_messages (user_id, day, message, source) values (gen_random_uuid(), 1, 'x', 'ai')`)).rejects.toThrow();
  });

  it("xoá tài khoản xoá luôn lời nhắn", async () => {
    await pg.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('22222222-2222-2222-2222-222222222222', 'b@x.vn', '{"username":"Bob_02"}')`);
    await ins(`insert into coach_messages (user_id, day, message, source) values ('22222222-2222-2222-2222-222222222222', 5, 'x', 'ai')`);
    await pg.exec(`delete from auth.users where id = '22222222-2222-2222-2222-222222222222'`);
    expect((await pg.query(`select 1 from coach_messages where user_id = '22222222-2222-2222-2222-222222222222'`)).rows).toHaveLength(0);
  });
});

describe("error_explanations", () => {
  it("không có user_id: bảng dùng chung, không chứa gì về người học", async () => {
    const cols = await pg.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'error_explanations'`);
    expect(cols.rows.map((c) => c.column_name).sort()).toEqual(["cache_key", "created_at", "text"]);
  });

  it("khoá phải đủ 64 ký tự (sha256 hex); trùng khoá thì giữ bản đầu (ignoreDuplicates)", async () => {
    await expect(ins(`insert into error_explanations (cache_key, text) values ('short', 'x')`)).rejects.toThrow();
    await ins(`insert into error_explanations (cache_key, text) values ($1, 'đầu') on conflict (cache_key) do nothing`, [KEY]);
    await ins(`insert into error_explanations (cache_key, text) values ($1, 'sau') on conflict (cache_key) do nothing`, [KEY]);
    expect((await pg.query<{ text: string }>(`select text from error_explanations where cache_key = $1`, [KEY])).rows[0].text).toBe("đầu");
  });

  it("text không rỗng và không quá 1000", async () => {
    await expect(ins(`insert into error_explanations (cache_key, text) values ($1, '')`, ["b".repeat(64)])).rejects.toThrow();
    await expect(ins(`insert into error_explanations (cache_key, text) values ($1, $2)`, ["c".repeat(64), "x".repeat(1001)])).rejects.toThrow();
  });
});

describe("quyền: chỉ service_role", () => {
  it.each(["anon", "authenticated"])("%s không đọc, không ghi được hai bảng", async (role) => {
    await expect(as(role, `select * from coach_messages`)).rejects.toThrow(/permission denied/);
    await expect(as(role, `select * from error_explanations`)).rejects.toThrow(/permission denied/);
    await expect(as(role, `insert into error_explanations (cache_key, text) values ($1, 'x')`, ["d".repeat(64)])).rejects.toThrow(/permission denied/);
  });

  it("service_role có đủ quyền (trên Supabase thật nó bỏ qua RLS; stub PGlite không có BYPASSRLS nên chỉ kiểm quyền bảng)", async () => {
    for (const t of ["coach_messages", "error_explanations"]) {
      for (const priv of ["select", "insert", "update", "delete"]) {
        const r = await pg.query<{ ok: boolean }>(`select has_table_privilege('service_role', 'public.${t}', '${priv}') as ok`);
        expect(r.rows[0].ok, `${t} ${priv}`).toBe(true);
      }
    }
  });

  it("bật RLS và không có policy nào cho anon/authenticated", async () => {
    const r = await pg.query<{ relname: string; relrowsecurity: boolean }>(`select relname, relrowsecurity from pg_class where relname in ('coach_messages','error_explanations') order by 1`);
    expect(r.rows).toEqual([{ relname: "coach_messages", relrowsecurity: true }, { relname: "error_explanations", relrowsecurity: true }]);
    expect((await pg.query(`select 1 from pg_policies where tablename in ('coach_messages','error_explanations')`)).rows).toHaveLength(0);
  });

  it("metabase_ro không thấy hai bảng (chỉ có schema analytics)", async () => {
    await expect(as("metabase_ro", `select * from public.coach_messages`)).rejects.toThrow(/permission denied/);
    await expect(as("metabase_ro", `select * from public.error_explanations`)).rejects.toThrow(/permission denied/);
  });
});

describe("chạy lại migration an toàn", () => {
  it("0015 chạy lần hai không lỗi và không mất dữ liệu", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const sql = readFileSync(path.join(__dirname, "..", "..", "supabase", "migrations", "0015_ai_cache.sql"), "utf8");
    await pg.exec(sql);
    expect((await pg.query(`select 1 from error_explanations where cache_key = $1`, [KEY])).rows).toHaveLength(1);
  });
});
