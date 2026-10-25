import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./helpers";

let pg: PGlite;
const U = "11111111-1111-1111-1111-111111111111";
const one = async <T extends object>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows[0];

beforeAll(async () => {
  ({ pg } = await freshDb());
  await pg.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${U}', 'a@x.vn', '{"username":"Alice_01"}')`);
}, 60000);
afterAll(() => pg.close());

describe("migration 0011: điểm đọc / nghe", () => {
  it("apply_exam_result ghi score_reading / score_listening; payload cũ để NULL", async () => {
    const mk = async () =>
      (await one<{ id: string }>(`insert into level_exams (user_id, cefr, items, expires_at) values ($1, 'A1', '[]', now() + interval '20 minutes') returning id`, [U])).id;

    let id = await mk();
    await pg.query(`select apply_exam_result($1, $2, $3::jsonb)`, [U, id, JSON.stringify({ passed: false, total: 0.5, vocab: 0.5, grammar: 0.5, reading: 0.25, listening: 1, today: 105 })]);
    expect(await one(`select score_reading::float r, score_listening::float l from level_exams where id = $1`, [id])).toEqual({ r: 0.25, l: 1 });

    id = await mk();
    await pg.query(`select apply_exam_result($1, $2, $3::jsonb)`, [U, id, JSON.stringify({ passed: false, total: 0.5, vocab: 0.5, grammar: 0.5, today: 105 })]);
    expect(await one(`select score_reading r, score_listening l from level_exams where id = $1`, [id])).toEqual({ r: null, l: null });
  });

  it("apply_practice_result ghi score_reading / score_listening", async () => {
    const id = (await one<{ id: string }>(`insert into practice_tests (user_id, items, expires_at) values ($1, '[]', now() + interval '20 minutes') returning id`, [U])).id;
    await pg.query(`select apply_practice_result($1, $2, $3::jsonb)`, [U, id, JSON.stringify({ total: 0.8, vocab: 0.9, grammar: 0.8, reading: 0.5, listening: 0, today: 105, wrongWords: [] })]);
    expect(await one(`select score_reading::float r, score_listening::float l, score_total::float t from practice_tests where id = $1`, [id])).toEqual({ r: 0.5, l: 0, t: 0.8 });
  });

  it("vẫn chỉ service_role gọi được hai hàm sau khi thay", async () => {
    const r = await one<{ a: boolean; b: boolean; c: boolean }>(
      `select has_function_privilege('authenticated', 'public.apply_exam_result(uuid,uuid,jsonb)', 'execute') a,
              has_function_privilege('authenticated', 'public.apply_practice_result(uuid,uuid,jsonb)', 'execute') b,
              has_function_privilege('service_role', 'public.apply_exam_result(uuid,uuid,jsonb)', 'execute') c`);
    expect(r).toEqual({ a: false, b: false, c: true });
  });
});
