import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./helpers";

let pg: PGlite;
const U1 = "11111111-1111-1111-1111-111111111111";

beforeAll(async () => {
  ({ pg } = await freshDb());
  await pg.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${U1}', 'a@x.vn', '{"username":"Alice_01"}')`);
}, 60000);
afterAll(() => pg.close());

describe("profiles.role (0017)", () => {
  it("mặc định là 'user'", async () => {
    const r = await pg.query<{ role: string }>(`select role from profiles where id = $1`, [U1]);
    expect(r.rows[0]?.role).toBe("user");
  });

  it("chỉ nhận 'user' hoặc 'admin'", async () => {
    await expect(pg.query(`update profiles set role = 'root' where id = $1`, [U1])).rejects.toThrow();
  });

  it("service_role đặt được admin; authenticated KHÔNG tự nâng quyền được", async () => {
    await pg.exec(`set role authenticated`);
    await expect(pg.query(`update profiles set role = 'admin' where id = $1`, [U1])).rejects.toThrow(/permission denied/);
    await pg.exec(`reset role`);
    await pg.exec(`alter role service_role bypassrls`); // như Supabase thật: service_role bỏ qua RLS
    await pg.exec(`set role service_role`);
    await pg.query(`update profiles set role = 'admin' where id = $1`, [U1]);
    await pg.exec(`reset role`);
    expect((await pg.query<{ role: string }>(`select role from profiles where id = $1`, [U1])).rows[0]?.role).toBe("admin");
  });
});
