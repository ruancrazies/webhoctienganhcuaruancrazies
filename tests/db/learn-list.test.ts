import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./helpers";

let pg: PGlite;
const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const ids: number[] = []; // 12 từ A1/general, freq_rank 1..12
let topicId: number;

const rows = async <T extends object>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows;
const newWords = (user: string, rank: number | null = null, id: number | null = null, limit = 50, topic: number | null = null, domain = "all") =>
  rows<{ id: number; freq_rank: number }>(`select * from list_new_words($1, 'A1', $2, $3, $4, $5, $6)`, [user, domain, topic, rank, id, limit]);
const reviewWords = (user: string, us: number | null = null, id: number | null = null, limit = 50, topic: number | null = null) =>
  rows<{ id: number; next_us: number }>(`select * from list_review_words($1, 'A1', 'all', $2, $3, $4, $5)`, [user, topic, us, id, limit]);

beforeAll(async () => {
  ({ pg } = await freshDb());
  await pg.exec(`insert into domains (code, title) values ('general', 'Chung'), ('travel', 'Du lịch')`);
  for (let i = 1; i <= 12; i++) {
    const r = (
      await rows<{ id: number }>(
        `insert into words (key, en, pos, vi, cefr, domain, freq_rank) values ($1, $2, 'n', $3, 'A1', $4, $5) returning id`,
        [`w${i}:n:1`, `w${i}`, `nghĩa ${i}`, i > 10 ? "travel" : "general", i],
      )
    )[0];
    ids.push(r.id);
  }
  // từ retired không được xuất hiện ở đâu cả
  await pg.exec(`insert into words (key, en, pos, vi, cefr, domain, freq_rank, status) values ('old:n:1', 'old', 'n', 'cũ', 'A1', 'general', 0, 'retired')`);
  topicId = (await rows<{ id: number }>(`insert into topics (slug, title, cefr, domain) values ('t1', 'T1', 'A1', 'general') returning id`))[0].id;
  await pg.exec(`insert into word_topics (word_id, topic_id, rand) values (${ids[0]}, ${topicId}, 0.1), (${ids[2]}, ${topicId}, 0.2), (${ids[4]}, ${topicId}, 0.3)`);
  await pg.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${U1}', 'a@x.vn', '{"username":"Alice_01"}'), ('${U2}', 'b@x.vn', '{"username":"Bob_02"}')`);
  // U1: đã có tiến độ với từ 1, 2 (đã đến hạn từ lâu), 3 (hạn ở tương lai), 4 (level 0)
  await pg.exec(`
    insert into user_word_progress (user_id, word_id, cefr, domain, level, next_review) values
      ('${U1}', ${ids[0]}, 'A1', 'general', 1, '2026-10-20T00:00:00.123456Z'),
      ('${U1}', ${ids[1]}, 'A1', 'general', 2, '2026-10-21T00:00:00Z'),
      ('${U1}', ${ids[2]}, 'A1', 'general', 3, '2026-12-01T00:00:00Z'),
      ('${U1}', ${ids[3]}, 'A1', 'general', 0, '2026-10-22T00:00:00Z')`);
}, 60000);
afterAll(() => pg.close());

describe("list_new_words", () => {
  it("chỉ trả từ CHƯA có tiến độ, đúng thứ tự tần suất, bỏ từ retired", async () => {
    const got = await newWords(U1);
    expect(got.map((r) => r.id)).toEqual(ids.slice(4)); // từ 5..12
    expect(got.map((r) => r.freq_rank)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("người dùng khác không bị ảnh hưởng bởi tiến độ của U1", async () => {
    expect((await newWords(U2)).map((r) => r.id)).toEqual(ids);
  });

  it("phân trang keyset: lượt sau bắt đầu ngay sau con trỏ, không trùng, không sót", async () => {
    const p1 = await newWords(U1, null, null, 3);
    expect(p1.map((r) => r.id)).toEqual(ids.slice(4, 7));
    const last = p1[p1.length - 1];
    const p2 = await newWords(U1, last.freq_rank, last.id, 3);
    expect(p2.map((r) => r.id)).toEqual(ids.slice(7, 10));
    const last2 = p2[p2.length - 1];
    const p3 = await newWords(U1, last2.freq_rank, last2.id, 3);
    expect(p3.map((r) => r.id)).toEqual(ids.slice(10, 12));
  });

  it("lọc theo lĩnh vực và theo chủ đề", async () => {
    expect((await newWords(U1, null, null, 50, null, "travel")).map((r) => r.id)).toEqual(ids.slice(10));
    // chủ đề t1 có từ 1, 3, 5; U1 đã có tiến độ với 1 và 3 → chỉ còn từ 5
    expect((await newWords(U1, null, null, 50, topicId)).map((r) => r.id)).toEqual([ids[4]]);
  });

  it("đánh dấu đã học (có tiến độ) thì từ rời danh sách từ mới", async () => {
    await pg.exec(`insert into user_word_progress (user_id, word_id, cefr, domain, level) values ('${U1}', ${ids[4]}, 'A1', 'general', 1)`);
    expect((await newWords(U1)).map((r) => r.id)).toEqual(ids.slice(5));
    await pg.exec(`delete from user_word_progress where user_id = '${U1}' and word_id = ${ids[4]}`);
  });
});

describe("list_review_words", () => {
  it("chỉ trả từ ĐÃ có tiến độ, đến hạn trước (next_review tăng dần)", async () => {
    const got = await reviewWords(U1);
    expect(got.map((r) => r.id)).toEqual([ids[0], ids[1], ids[3], ids[2]]);
    expect((await reviewWords(U2)).length).toBe(0);
  });

  it("keyset theo micro-giây: không trùng dù next_review có phần micro-giây", async () => {
    const p1 = await reviewWords(U1, null, null, 1);
    expect(p1.map((r) => r.id)).toEqual([ids[0]]);
    const all: number[] = [...p1.map((r) => r.id)];
    let cur = p1[0];
    for (let i = 0; i < 5; i++) {
      const next = await reviewWords(U1, cur.next_us, cur.id, 1);
      if (!next.length) break;
      all.push(next[0].id);
      cur = next[0];
    }
    expect(all).toEqual([ids[0], ids[1], ids[3], ids[2]]);
  });

  it("lọc theo chủ đề", async () => {
    expect((await reviewWords(U1, null, null, 50, topicId)).map((r) => r.id)).toEqual([ids[0], ids[2]]);
  });

  it("không có quyền gọi từ anon/authenticated", async () => {
    await pg.exec(`set role authenticated`);
    await expect(pg.query(`select * from list_new_words($1, 'A1', 'all', null, null, null, 5)`, [U1])).rejects.toThrow(/permission denied/);
    await expect(pg.query(`select * from list_review_words($1, 'A1', 'all', null, null, null, 5)`, [U1])).rejects.toThrow(/permission denied/);
    await pg.exec(`reset role`);
  });
});

describe("hit_rate_limit dọn rác", () => {
  it("migration dọn cửa sổ cũ; hàm vẫn đếm đúng và xóa dần hàng cũ của mọi key", async () => {
    await pg.exec(`insert into rate_limits (key, window_start, count) values ('old:ip1', now() - interval '5 days', 3), ('old:ip2', now() - interval '3 days', 1)`);
    // gọi đủ nhiều để xác suất 1% chắc chắn xảy ra (1 - 0.99^1500 > 99,999%)
    for (let i = 0; i < 1500; i++) await pg.query(`select hit_rate_limit('fresh:k', 3600, 100000)`);
    const left = await rows<{ key: string }>(`select key from rate_limits where key like 'old:%'`);
    expect(left).toEqual([]);
    const fresh = await rows<{ count: number }>(`select count from rate_limits where key = 'fresh:k'`);
    expect(fresh[0].count).toBe(1500); // dọn không đụng tới cửa sổ hiện tại
  }, 60000);
});

describe("list_new_words: từ cùng freq_rank (rank trống)", () => {
  it("không xếp theo id/bảng chữ cái, ổn định và phân trang keyset đủ không trùng", async () => {
    const tie: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await rows<{ id: number }>(
        `insert into words (key, en, pos, vi, cefr, domain, rand) values ($1, $2, 'n', $3, 'A1', 'general', $4) returning id`,
        [`tie${i}:n:1`, `tie${String.fromCharCode(97 + i)}`, `hòa ${i}`, ((i * 7) % 12) / 12 + 0.01],
      );
      tie.push(r[0].id);
    }
    const all = (await newWords(U2, 1000000000 - 1, 0)).map((r) => r.id).filter((id) => tie.includes(id));
    expect(all).toHaveLength(12);
    expect(all).not.toEqual(tie); // không còn theo thứ tự id
    const seen: number[] = [];
    let cur: { freq_rank: number; id: number } | null = null;
    for (;;) {
      const page: { id: number; freq_rank: number }[] = await newWords(U2, cur?.freq_rank ?? 1000000000 - 1, cur?.id ?? 0, 5);
      if (!page.length) break;
      seen.push(...page.map((r) => r.id));
      cur = page[page.length - 1];
    }
    expect(seen.filter((id) => tie.includes(id))).toEqual(all);
    expect(new Set(seen).size).toBe(seen.length);
  });
});
