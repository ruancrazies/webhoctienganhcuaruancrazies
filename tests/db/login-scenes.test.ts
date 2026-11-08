import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./helpers";

let pg: PGlite;
const U1 = "11111111-1111-1111-1111-111111111111";

beforeAll(async () => {
  ({ pg } = await freshDb());
  await pg.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${U1}', 'a@x.vn', '{"username":"Alice_01"}')`);
  await pg.exec(`alter role service_role bypassrls`);
}, 60000);
afterAll(() => pg.close());

const pinned = async () => (await pg.query<{ key: string }>(`select key from login_scenes where pinned order by key`)).rows.map((r) => r.key);

describe("login_scenes (0018)", () => {
  it("key phải đúng dạng id; câu chào 1–80 ký tự; status chỉ draft/published", async () => {
    await expect(pg.query(`insert into login_scenes (key) values ('Halloween')`)).rejects.toThrow();
    await expect(pg.query(`insert into login_scenes (key) values ('h')`)).rejects.toThrow();
    await expect(pg.query(`insert into login_scenes (key, greeting) values ('halloween', '')`)).rejects.toThrow();
    await expect(pg.query(`insert into login_scenes (key, greeting) values ('halloween', $1)`, ["a".repeat(81)])).rejects.toThrow();
    await expect(pg.query(`insert into login_scenes (key, status) values ('halloween', 'live')`)).rejects.toThrow();
    await pg.query(`insert into login_scenes (key, greeting) values ('halloween', $1)`, ["a".repeat(80)]);
    const r = await pg.query<{ status: string; pinned: boolean; motion_enabled: boolean }>(`select status, pinned, motion_enabled from login_scenes where key='halloween'`);
    expect(r.rows[0]).toEqual({ status: "draft", pinned: false, motion_enabled: true });
  });

  it("chỉ mục chặn hai scene cùng ghim", async () => {
    await pg.exec(`insert into login_scenes (key, status, pinned) values ('giang-sinh', 'published', true)`);
    await expect(pg.query(`update login_scenes set pinned = true where key = 'halloween'`)).rejects.toThrow(/login_scenes_one_pinned|duplicate/);
    await pg.exec(`update login_scenes set pinned = false`);
  });
});

describe("login_scene_set_pin()", () => {
  it("ghim scene chưa có dòng: tạo dòng, xuất bản, ghim", async () => {
    await pg.exec(`select login_scene_set_pin('tet')`);
    expect(await pinned()).toEqual(["tet"]);
    const r = await pg.query<{ status: string }>(`select status from login_scenes where key='tet'`);
    expect(r.rows[0]?.status).toBe("published");
  });
  it("ghim scene khác: chuyển ghim, luôn đúng một scene được ghim", async () => {
    await pg.exec(`select login_scene_set_pin('halloween')`);
    expect(await pinned()).toEqual(["halloween"]);
    await pg.exec(`select login_scene_set_pin('giang-sinh')`);
    expect(await pinned()).toEqual(["giang-sinh"]);
    // ghim lại chính nó: không đổi
    await pg.exec(`select login_scene_set_pin('giang-sinh')`);
    expect(await pinned()).toEqual(["giang-sinh"]);
  });
  it("ghim = xuất bản (scene nháp thành đã xuất bản)", async () => {
    await pg.exec(`update login_scenes set status = 'draft', pinned = false where key = 'halloween'`);
    await pg.exec(`select login_scene_set_pin('halloween')`);
    const r = await pg.query<{ status: string; pinned: boolean }>(`select status, pinned from login_scenes where key='halloween'`);
    expect(r.rows[0]).toEqual({ status: "published", pinned: true });
  });
  it("null = bỏ ghim tất cả", async () => {
    await pg.exec(`select login_scene_set_pin(null)`);
    expect(await pinned()).toEqual([]);
  });
});

describe("login_scene_schedules", () => {
  it("ends_on ≥ starts_on, tối đa 120 ngày, ưu tiên 0–100, khóa ngoại tới scene", async () => {
    const ins = (k: string, a: string, b: string, p = 0) => pg.query(`insert into login_scene_schedules (scene_key, starts_on, ends_on, priority) values ($1,$2,$3,$4)`, [k, a, b, p]);
    await expect(ins("halloween", "2026-11-01", "2026-10-25")).rejects.toThrow();
    await expect(ins("halloween", "2026-01-01", "2027-01-01")).rejects.toThrow();
    await expect(ins("halloween", "2026-10-25", "2026-11-01", 101)).rejects.toThrow();
    await expect(ins("khong-co-dong", "2026-10-25", "2026-11-01")).rejects.toThrow();
    await ins("halloween", "2026-10-25", "2026-11-01", 3);
    await ins("halloween", "2027-10-25", "2027-11-01", 3); // nhiều năm, nhiều khoảng
    expect((await pg.query(`select 1 from login_scene_schedules where scene_key='halloween'`)).rows).toHaveLength(2);
  });
  it("xóa scene thì lịch xóa theo (cascade)", async () => {
    await pg.exec(`delete from login_scenes where key = 'halloween'`);
    expect((await pg.query(`select 1 from login_scene_schedules`)).rows).toHaveLength(0);
  });
});

describe("admin_audit", () => {
  it("ghi được trước/sau; xóa người dùng thì giữ nhật ký (admin_id về null)", async () => {
    await pg.query(`insert into admin_audit (admin_id, action, target, before, after) values ($1, 'scene.pin', 'scene:halloween', $2, $3)`, [U1, JSON.stringify({ pinned: null }), JSON.stringify({ pinned: "halloween" })]);
    await pg.query(`delete from auth.users where id = $1`, [U1]);
    const r = await pg.query<{ admin_id: string | null; after: { pinned: string } }>(`select admin_id, after from admin_audit`);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ admin_id: null, after: { pinned: "halloween" } });
  });
});

describe("quyền truy cập", () => {
  it("authenticated/anon KHÔNG đọc/ghi được các bảng và hàm này; service_role thì được", async () => {
    for (const role of ["authenticated", "anon"]) {
      await pg.exec(`set role ${role}`);
      for (const sql of [
        `select * from login_scenes`,
        `insert into login_scenes (key) values ('hacker')`,
        `select * from login_scene_schedules`,
        `select * from admin_audit`,
        `select login_scene_set_pin('halloween')`,
      ]) {
        await expect(pg.query(sql), `${role}: ${sql}`).rejects.toThrow(/permission denied/);
      }
      await pg.exec(`reset role`);
    }
    await pg.exec(`set role service_role`);
    await pg.query(`select * from login_scenes`);
    await pg.query(`select login_scene_set_pin(null)`);
    await pg.exec(`reset role`);
  });
});
