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

describe("profiles.accent (0021)", () => {
  it("mặc định là null (dùng màu của theme)", async () => {
    const r = await pg.query<{ accent: string | null }>(`select accent from profiles where id = $1`, [U1]);
    expect(r.rows[0]?.accent).toBeNull();
  });

  it("nhận mã hợp lệ và cho đặt lại về null", async () => {
    await pg.query(`update profiles set accent = 'bien' where id = $1`, [U1]);
    expect((await pg.query<{ accent: string }>(`select accent from profiles where id = $1`, [U1])).rows[0]?.accent).toBe("bien");
    await pg.query(`update profiles set accent = null where id = $1`, [U1]);
    expect((await pg.query<{ accent: string | null }>(`select accent from profiles where id = $1`, [U1])).rows[0]?.accent).toBeNull();
  });

  it("từ chối chuỗi không phải mã (chữ hoa, ký tự lạ, quá dài, rỗng)", async () => {
    for (const bad of ["Bien", "a", "bien;drop", "../x", "x".repeat(30), "", "red color", "#ff0000"]) {
      await expect(pg.query(`update profiles set accent = $2 where id = $1`, [U1, bad]), bad).rejects.toThrow();
    }
  });

  it("authenticated không tự đổi được (chỉ server/service_role ghi)", async () => {
    await pg.exec(`set role authenticated`);
    await expect(pg.query(`update profiles set accent = 'la' where id = $1`, [U1])).rejects.toThrow(/permission denied/);
    await pg.exec(`reset role`);
  });
});
