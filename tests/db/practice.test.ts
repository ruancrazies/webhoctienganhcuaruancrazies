import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./helpers";

let pg: PGlite;
const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const ids: number[] = [];

const one = async <T extends object>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows[0];
const newTest = async (user: string, expires = "now() + interval '20 minutes'") =>
  (await one<{ id: string }>(`insert into practice_tests (user_id, items, expires_at) values ($1, '[]', ${expires}) returning id`, [user])).id;
const apply = (user: string, test: string, payload: object) =>
  pg.query(`select apply_practice_result($1, $2, $3::jsonb) as r`, [user, test, JSON.stringify(payload)]);
const nextReview = async (user: string, wordId: number) =>
  (await one<{ nr: Date; level: number }>(`select next_review as nr, level from user_word_progress where user_id = $1 and word_id = $2`, [user, wordId]))!;

beforeAll(async () => {
  ({ pg } = await freshDb());
  await pg.exec(`insert into domains (code, title) values ('general', 'Chung')`);
  for (let i = 1; i <= 4; i++) {
    ids.push((await one<{ id: number }>(`insert into words (key, en, pos, vi, cefr, domain) values ($1, $2, 'n', $3, 'A1', 'general') returning id`, [`w${i}:n:1`, `w${i}`, `nghĩa ${i}`]))!.id);
  }
  await pg.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${U1}', 'a@x.vn', '{"username":"Alice_01"}'), ('${U2}', 'b@x.vn', '{"username":"Bob_02"}')`);
  // U1: từ 1,2 chưa đến hạn (7 ngày nữa), từ 3 đã đến hạn từ hôm qua; mức level khác nhau
  await pg.exec(`
    insert into user_word_progress (user_id, word_id, cefr, domain, level, next_review) values
      ('${U1}', ${ids[0]}, 'A1', 'general', 4, now() + interval '7 days'),
      ('${U1}', ${ids[1]}, 'A1', 'general', 2, now() + interval '3 days'),
      ('${U1}', ${ids[2]}, 'A1', 'general', 1, now() - interval '1 day')`);
}, 60000);
afterAll(() => pg.close());

describe("apply_practice_result", () => {
  it("ghi điểm, đóng bài, hẹn ôn ngay các từ sai nhưng KHÔNG đổi level", async () => {
    const t = await newTest(U1);
    await apply(U1, t, { total: 0.6, vocab: 0.5, grammar: 0.8, today: 20000, wrongWords: [ids[0], ids[1]] });

    const row = await one<{ finished_at: string | null; score_total: string; score_vocab: string; score_grammar: string }>(
      `select finished_at, score_total, score_vocab, score_grammar from practice_tests where id = $1`, [t]);
    expect(row.finished_at).not.toBeNull();
    expect(Number(row.score_total)).toBeCloseTo(0.6);
    expect(Number(row.score_vocab)).toBeCloseTo(0.5);
    expect(Number(row.score_grammar)).toBeCloseTo(0.8);

    for (const id of [ids[0], ids[1]]) {
      const p = await nextReview(U1, id);
      expect(p.nr.getTime()).toBeLessThanOrEqual(Date.now() + 1000); // đến hạn ngay
    }
    expect((await nextReview(U1, ids[0])).level).toBe(4); // level giữ nguyên
    expect((await nextReview(U1, ids[1])).level).toBe(2);
  });

  it("không động tới từ làm đúng; từ đã đến hạn từ trước giữ nguyên thời điểm cũ", async () => {
    const t = await newTest(U1);
    const before = (await nextReview(U1, ids[2])).nr.getTime();
    await apply(U1, t, { total: 1, vocab: 1, grammar: 1, today: 20000, wrongWords: [ids[2]] });
    expect((await nextReview(U1, ids[2])).nr.getTime()).toBe(before); // đã đến hạn, không bị đẩy về "bây giờ"
  });

  it("từ của người khác và từ chưa có tiến độ không bị ảnh hưởng, không lỗi", async () => {
    const t = await newTest(U2);
    await expect(apply(U2, t, { total: 0, vocab: 0, grammar: 0, today: 20000, wrongWords: [ids[0], ids[3]] })).resolves.toBeDefined();
    expect((await nextReview(U1, ids[0])).nr.getTime()).toBeLessThanOrEqual(Date.now() + 1000); // vẫn là kết quả của lần trước
    const n = await one<{ c: string }>(`select count(*)::text c from user_word_progress where user_id = $1`, [U2]);
    expect(n.c).toBe("0");
  });

  it("không cộng XP, không ghi level_passes, không đụng bài thi lên cấp", async () => {
    const t = await newTest(U1);
    const xpBefore = (await one<{ xp: string }>(`select xp::text from profiles where id = $1`, [U1]))!.xp;
    await apply(U1, t, { total: 1, vocab: 1, grammar: 1, today: 20001, wrongWords: [] });
    expect((await one<{ xp: string }>(`select xp::text from profiles where id = $1`, [U1]))!.xp).toBe(xpBefore);
    expect((await one<{ c: string }>(`select count(*)::text c from level_passes where user_id = $1`, [U1]))!.c).toBe("0");
    expect((await one<{ c: string }>(`select count(*)::text c from level_exams where user_id = $1`, [U1]))!.c).toBe("0");
  });

  it("cập nhật chuỗi ngày", async () => {
    const t = await newTest(U2);
    await apply(U2, t, { total: 1, vocab: 1, grammar: 1, today: 21000, wrongWords: [] });
    expect((await one<{ last_day: number }>(`select last_day from profiles where id = $1`, [U2]))!.last_day).toBe(21000);
  });

  it("nộp lần hai → test_finished_or_invalid", async () => {
    const t = await newTest(U1);
    await apply(U1, t, { total: 1, vocab: 1, grammar: 1, today: 20001, wrongWords: [] });
    await expect(apply(U1, t, { total: 1, vocab: 1, grammar: 1, today: 20001, wrongWords: [] })).rejects.toThrow(/test_finished_or_invalid/);
  });

  it("không nộp được bài của người khác", async () => {
    const t = await newTest(U1);
    await expect(apply(U2, t, { total: 1, vocab: 1, grammar: 1, today: 20001, wrongWords: [] })).rejects.toThrow(/test_finished_or_invalid/);
    await pg.query(`select fail_practice_test($1, $2)`, [U1, t]); // dọn bài dở để không ảnh hưởng test sau
  });
});

describe("nộp trễ", () => {
  it("bài đã quá giờ nhưng chưa bị đóng vẫn được chấm và hẹn ôn từ sai như thường", async () => {
    const t = await newTest(U1, "now() - interval '10 minutes'");
    await apply(U1, t, { total: 0.7, vocab: 0.6, grammar: 0.9, today: 20002, wrongWords: [ids[1]] });
    const row = await one<{ finished_at: string | null; score_total: string }>(`select finished_at, score_total from practice_tests where id = $1`, [t]);
    expect(row.finished_at).not.toBeNull();
    expect(Number(row.score_total)).toBeCloseTo(0.7);
  });
});

describe("fail_practice_test và ràng buộc một bài dở", () => {
  it("mỗi người chỉ có một bài chưa nộp", async () => {
    const t = await newTest(U1);
    await expect(newTest(U1)).rejects.toThrow();
    await pg.query(`select fail_practice_test($1, $2)`, [U1, t]); // dọn
  });

  it("bài bỏ dở quá giờ → đóng tại expires_at với điểm 0, vẫn tính là một lần làm", async () => {
    const t = await newTest(U1, "now() - interval '1 minute'");
    const r = await one<{ ok: boolean }>(`select fail_practice_test($1, $2) as ok`, [U1, t]);
    expect(r.ok).toBe(true);
    const row = await one<{ finished_at: string | null; score_total: string | null }>(`select finished_at, score_total from practice_tests where id = $1`, [t]);
    expect(row.finished_at).not.toBeNull();
    expect(Number(row.score_total)).toBe(0);
    const counted = await one<{ c: string }>(`select count(*)::text c from practice_tests where id = $1 and score_total is not null`, [t]);
    expect(counted.c).toBe("1"); // có điểm nên xuất hiện trong lịch sử
    expect((await one<{ ok: boolean }>(`select fail_practice_test($1, $2) as ok`, [U1, t]))!.ok).toBe(false); // đã đóng
  });
});

describe("quyền truy cập", () => {
  it("anon/authenticated không đọc được bảng (có đáp án) và không gọi được hàm", async () => {
    const t = await one<{ a: boolean; b: boolean }>(
      `select has_table_privilege('authenticated', 'public.practice_tests', 'select') as a,
              has_table_privilege('anon', 'public.practice_tests', 'select') as b`);
    expect(t).toEqual({ a: false, b: false });
    const f = await one<{ a: boolean; b: boolean }>(
      `select has_function_privilege('authenticated', 'public.apply_practice_result(uuid,uuid,jsonb)', 'execute') as a,
              has_function_privilege('service_role', 'public.apply_practice_result(uuid,uuid,jsonb)', 'execute') as b`);
    expect(f).toEqual({ a: false, b: true });
  });
});
