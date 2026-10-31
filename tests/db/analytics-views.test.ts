import type { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./helpers";

/** Giai đoạn 1a (migration 0013): schema `analytics` cho Metabase + role metabase_ro chỉ đọc. */

let pg: PGlite;
const one = async <T extends object>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows[0];
const all = async <T extends object>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows;
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const USERS = 12; // U1..U12; U1..U6 là "người học mạnh" (thêm 40 câu đúng)
const refresh = () => pg.exec(`select analytics_private.refresh_all()`);

let wHard: number, wEasy: number, wRare: number, wFill: number, wTypeOk: number, gId: number, pqId: number;

/** Thêm n sự kiện cho một nhóm người dùng; mỗi dòng một source_id riêng (chốt chặn unique là (source, source_id, qid)). */
async function addEvents(o: {
  users: number[]; wordId?: number; grammarId?: number; passageId?: number; passageQuestionId?: number;
  game: string; part: string; cefr: string; correct: boolean; answer?: string; expected?: string; ms?: number | null; repeat?: number;
}) {
  for (const u of o.users) {
    for (let i = 0; i < (o.repeat ?? 1); i++) {
      await pg.query(
        `insert into answer_events (user_id, source, source_id, qid, game, part, word_id, grammar_id, passage_id, passage_question_id,
                                    cefr, domain, pos, grammar_topic, correct, answer_value, expected, response_ms)
         select $1, 'round', gen_random_uuid(), 'q1', $2, $3, $4::bigint, $5::bigint, $6::bigint, $7::bigint,
                $8, w.domain, w.pos, g.topic, $9, $10, $11, $12
           from (select 1) x
           left join words w on w.id = $4::bigint
           left join grammar_questions g on g.id = $5::bigint`,
        [uid(u), o.game, o.part, o.wordId ?? null, o.grammarId ?? null, o.passageId ?? null, o.passageQuestionId ?? null,
         o.cefr, o.correct, o.answer ?? "", o.expected ?? "", o.ms === undefined ? 1000 : o.ms],
      );
    }
  }
}
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

beforeAll(async () => {
  ({ pg } = await freshDb());
  await pg.exec(`insert into domains (code, title) values ('general', 'Chung')`);
  const mk = async (key: string, pos: string) =>
    (await one<{ id: number }>(`insert into words (key, en, pos, vi, cefr, domain) values ($1, $1, $2, 'nghĩa', 'A1', 'general') returning id`, [key, pos])).id;
  wHard = await mk("hard", "adj"); wEasy = await mk("easy", "adj"); wRare = await mk("rare", "adj");
  wFill = await mk("fill", "n"); wTypeOk = await mk("typeok", "n");
  gId = (await one<{ id: number }>(`insert into grammar_questions (key, level, topic, question, options, answer) values ('g1', 'A2', 'tenses', 'She ___ home.', '["go","goes"]', 2) returning id`)).id;
  const ps = (await one<{ id: number }>(`insert into passages (key, skill, level, title, body) values ('p1', 'reading', 'B1', 'T', 'Body') returning id`)).id;
  pqId = (await one<{ id: number }>(`insert into passage_questions (key, passage_id, kind, question, options, answer, sort) values ('pq1', $1, 'tf', 'Q?', '[]', 1, 1) returning id`, [ps])).id;
  await pg.exec(`insert into auth.users (id, email, raw_user_meta_data)
                 select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'u' || n || '@x.vn', jsonb_build_object('username', 'User_' || lpad(n::text, 2, '0'))
                   from generate_series(1, ${USERS}) n`);

  await refresh(); // làm mới khi chưa có sự kiện nào: không được lỗi
  const everyone = range(1, USERS), strong = range(1, 6);
  // wHard: 12 người, game type, sai hết ('harde' ×8, 'hart' ×4); thêm 1 lượt bỏ trống ở cloze
  await addEvents({ users: range(1, 8), wordId: wHard, game: "type", part: "vocab", cefr: "A1", correct: false, answer: "harde", expected: "hard", ms: 3000 });
  await addEvents({ users: range(9, 12), wordId: wHard, game: "type", part: "vocab", cefr: "A1", correct: false, answer: "hart", expected: "hard", ms: 3000 });
  await addEvents({ users: [1], wordId: wHard, game: "cloze", part: "vocab", cefr: "A1", correct: false, answer: "", expected: "hard", ms: null });
  await addEvents({ users: everyone, wordId: wTypeOk, game: "type", part: "vocab", cefr: "A1", correct: true, answer: "typeok", expected: "typeok" });
  await addEvents({ users: everyone, wordId: wEasy, game: "quiz", part: "vocab", cefr: "A1", correct: true, ms: 1000 });
  await addEvents({ users: [7], wordId: wRare, game: "quiz", part: "vocab", cefr: "A1", correct: false, answer: "x", expected: "rare", ms: 500 });
  await addEvents({ users: strong, wordId: wFill, game: "quiz", part: "vocab", cefr: "A1", correct: true, repeat: 40 });
  // wBoth (B2, tách cấp để không đổi mốc của A1): quiz sai 1/6, type sai 5/6 — để thử "so sánh game"
  const wBoth = (await one<{ id: number }>(`insert into words (key, en, pos, vi, cefr, domain) values ('both', 'both', 'adv', 'cả hai', 'B2', 'general') returning id`)).id;
  await addEvents({ users: range(1, 6), wordId: wBoth, game: "quiz", part: "vocab", cefr: "B2", correct: true });
  await addEvents({ users: [1], wordId: wBoth, game: "quiz", part: "vocab", cefr: "B2", correct: false, answer: "x", expected: "both", repeat: 1 });
  await addEvents({ users: range(1, 5), wordId: wBoth, game: "type", part: "vocab", cefr: "B2", correct: false, answer: "bot", expected: "both" });
  await addEvents({ users: [6], wordId: wBoth, game: "type", part: "vocab", cefr: "B2", correct: true });
  // ngữ pháp + câu hỏi bài đọc
  await addEvents({ users: range(1, 3), grammarId: gId, game: "grammar", part: "grammar", cefr: "A2", correct: false, answer: "go", expected: "goes" });
  await addEvents({ users: range(1, 3), passageId: 1, passageQuestionId: pqId, game: "passage", part: "reading", cefr: "B1", correct: true, answer: "1", expected: "1" });
  await refresh();
}, 120000);
afterAll(() => pg.close());

const num = (v: unknown) => Number(v);

describe("word_stats", () => {
  it("đếm lượt, người, sai; tỉ lệ sai thô và đã làm mượt theo trung bình cấp", async () => {
    const h = await one<Record<string, unknown>>(`select * from analytics.word_stats where word_id = $1`, [wHard]);
    expect(h).toMatchObject({ content_key: "hard", sheet_tab: "A1", en: "hard", pos: "adj", cefr: "A1", domain: "general" });
    expect(num(h.attempts)).toBe(13);        // 12 type + 1 cloze bỏ trống
    expect(num(h.users)).toBe(12);
    expect(num(h.wrong)).toBe(13);
    expect(num(h.wrong_rate)).toBe(1);
    // p0 của cấp A1: sai 13 + 1 (rare) = 14 trên tổng 13 + 12 + 12 + 1 + 240 = 278
    const p0 = 14 / 278;
    expect(num(h.cefr_wrong_rate)).toBeCloseTo(p0, 4);
    expect(num(h.wrong_rate_smoothed)).toBeCloseTo((13 + 5 * p0) / 18, 4);
    expect(num(h.timed_attempts)).toBe(12);  // lượt bỏ trống không có số đo
    expect(num(h.median_response_ms)).toBe(3000);
  });

  it("từ sai 1/1 lượt KHÔNG đứng đầu bảng xếp hạng đã làm mượt", async () => {
    const rows = await all<{ content_key: string; wrong_rate: string; wrong_rate_smoothed: string }>(
      `select content_key, wrong_rate, wrong_rate_smoothed from analytics.word_stats order by wrong_rate_smoothed desc`);
    expect(rows[0].content_key).toBe("hard");
    const rare = rows.find((r) => r.content_key === "rare")!;
    expect(num(rare.wrong_rate)).toBe(1);
    expect(num(rare.wrong_rate_smoothed)).toBeLessThan(0.4);
  });

  it("từ chưa có lượt nào không xuất hiện", async () => {
    const r = await all(`select 1 from analytics.word_stats where content_key = 'nobody'`);
    expect(r).toHaveLength(0);
  });
});

describe("item_stats", () => {
  it("tách theo game: cùng một từ, type sai nhiều hơn quiz", async () => {
    const rows = await all<{ game: string; attempts: string; blank: string }>(
      `select game, attempts, blank from analytics.item_stats where kind = 'word' and item_id = $1 order by game`, [wHard]);
    expect(rows.map((r) => [r.game, num(r.attempts), num(r.blank)])).toEqual([["cloze", 1, 1], ["type", 12, 0]]);
  });

  it("làm mượt theo trung bình của cùng (loại, game, cấp); người học mạnh tính riêng", async () => {
    const h = await one<Record<string, unknown>>(`select * from analytics.item_stats where kind = 'word' and item_id = $1 and game = 'type'`, [wHard]);
    // type A1: wHard 12 sai + wTypeOk 12 đúng → p0 = 0,5
    expect(num(h.group_wrong_rate)).toBe(0.5);
    expect(num(h.wrong_rate_smoothed)).toBeCloseTo((12 + 2.5) / 17, 4);
    expect(num(h.strong_users)).toBe(6);
    expect(num(h.strong_attempts)).toBe(6);
    expect(num(h.strong_wrong_rate)).toBe(1);
  });

  it("câu ngữ pháp và câu hỏi bài đọc có nhãn và key để tìm trên Sheet", async () => {
    const g = await one<Record<string, unknown>>(`select * from analytics.item_stats where kind = 'grammar'`);
    expect(g).toMatchObject({ content_key: "g1", sheet_tab: "grammar", grammar_topic: "tenses", label: "She ___ home.", cefr: "A2" });
    expect(num(g.attempts)).toBe(3);
    const p = await one<Record<string, unknown>>(`select * from analytics.item_stats where kind = 'passage_question'`);
    expect(p).toMatchObject({ content_key: "pq1", passage_key: "p1", part: "reading" });
  });
});

describe("group_stats", () => {
  it("gộp theo (part, game, cefr, pos, domain, chủ đề ngữ pháp)", async () => {
    const r = await one<Record<string, unknown>>(
      `select * from analytics.group_stats where part = 'vocab' and game = 'type' and cefr = 'A1' and pos = 'adj' and domain = 'general'`);
    expect(num(r.attempts)).toBe(12);
    expect(num(r.wrong)).toBe(12);
    const g = await one<Record<string, unknown>>(`select * from analytics.group_stats where part = 'grammar'`);
    expect(g).toMatchObject({ grammar_topic: "tenses", game: "grammar" });
  });
});

describe("confusion_pairs", () => {
  it("đáp án sai hay bị chọn nhất xếp trước; câu bỏ trống không vào", async () => {
    const rows = await all<{ chosen: string; times: string; users: string; expected: string; rank_in_item: string }>(
      `select chosen, times, users, expected, rank_in_item from analytics.confusion_pairs where kind = 'word' and item_id = $1 order by rank_in_item`, [wHard]);
    expect(rows.map((r) => [r.chosen, num(r.times), num(r.users), r.expected, num(r.rank_in_item)])).toEqual([
      ["harde", 8, 8, "hard", 1],
      ["hart", 4, 4, "hard", 2],
    ]);
  });
});

describe("content_flags", () => {
  it("cờ từ sai ≥ 80% với ≥ 10 người và người học mạnh cũng sai; từ bình thường không bị cờ", async () => {
    const rows = await all<{ content_key: string; game: string; flag_reason: string }>(`select content_key, game, flag_reason from analytics.content_flags order by content_key`);
    // hard: ≥ 10 người sai hết VÀ 6 người học mạnh sai hết → both. "both" (từ): chỉ 6 người (< 10) nhưng 5 người học mạnh đều sai → strong_users_wrong.
    // easy / rare / typeok / ngữ pháp / bài đọc: không bị cờ.
    expect(rows).toEqual([
      { content_key: "both", game: "type", flag_reason: "strong_users_wrong" },
      { content_key: "hard", game: "type", flag_reason: "both" },
    ]);
  });
});

describe("events_daily và refresh_status", () => {
  it("đếm theo ngày (giờ VN) và nguồn", async () => {
    const r = await all<{ source: string; answers: string; users: string }>(`select source, answers, users from analytics.events_daily`);
    expect(r).toHaveLength(1);
    expect(r[0].source).toBe("round");
    expect(num(r[0].users)).toBe(12);
  });
  it("refresh_all ghi nhật ký", async () => {
    const before = num((await one<{ n: string }>(`select count(*) n from analytics_private.refresh_log`)).n);
    await refresh();
    expect(num((await one<{ n: string }>(`select count(*) n from analytics_private.refresh_log`)).n)).toBe(before + 1);
    expect(num((await one<{ h: string }>(`select hours_since_refresh h from analytics.refresh_status`)).h)).toBeLessThan(1);
  });
});

describe("quyền của metabase_ro", () => {
  it("không view nào trong analytics lộ user_id / username / email", async () => {
    const cols = await all<{ rel: string; col: string }>(
      `select c.relname rel, a.attname col from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'analytics' and a.attnum > 0 and not a.attisdropped and c.relkind in ('v', 'm')
          and a.attname ~* '(user|email|name$)'`);
    // `users` (số người) là số đếm, không phải danh tính; `username`/`user_id`/`email` thì cấm.
    // `user_ref` (băm một chiều có muối, migration 0014) chỉ được có ở các view theo người của giai đoạn 2.
    const PER_USER_VIEWS = ["activity_daily", "user_cohorts", "user_levels", "exam_scores", "effect_by_user"];
    expect(cols.filter((c) => !["users", "users_wrong", "strong_users"].includes(c.col) && !(c.col === "user_ref" && PER_USER_VIEWS.includes(c.rel)))).toEqual([]);
  });

  it("đọc được analytics; KHÔNG đọc được bảng nào ở public / auth / analytics_private; không ghi được", async () => {
    const tables = await all<{ s: string; t: string }>(
      `select schemaname s, tablename t from pg_tables where schemaname in ('public', 'auth', 'analytics_private')`);
    expect(tables.length).toBeGreaterThan(15);
    const denied: string[] = [];
    const unexpected: string[] = [];
    await pg.exec(`set role metabase_ro`);
    try {
      expect(num((await one<{ n: string }>(`select count(*) n from analytics.word_stats`)).n)).toBeGreaterThan(0);
      await one(`select * from analytics.item_stats limit 1`);
      await one(`select * from analytics.content_flags limit 1`);
      await one(`select * from analytics.events_daily limit 1`);
      for (const { s, t } of tables) {
        try { await pg.query(`select * from ${s}."${t}" limit 1`); unexpected.push(`${s}.${t}`); }
        catch (e) { if (/permission denied/.test((e as Error).message)) denied.push(`${s}.${t}`); else unexpected.push(`${s}.${t}: ${(e as Error).message}`); }
      }
      await expect(pg.query(`insert into analytics_private.refresh_log default values`)).rejects.toThrow(/permission denied/);
      await expect(pg.query(`select analytics_private.refresh_all()`)).rejects.toThrow(/permission denied/);
      await expect(pg.query(`select record_answer_events(gen_random_uuid(), 'round', gen_random_uuid(), '[]')`)).rejects.toThrow(/permission denied/);
      await expect(pg.query(`select apply_round_result(gen_random_uuid(), gen_random_uuid(), '{}')`)).rejects.toThrow(/permission denied/);
    } finally {
      await pg.exec(`reset role`);
    }
    expect(unexpected).toEqual([]);
    expect(denied).toHaveLength(tables.length);
  });

  it("role: đăng nhập được nhưng mặc định chỉ đọc, giới hạn thời gian, không phải superuser", async () => {
    const r = await one<{ rolcanlogin: boolean; rolsuper: boolean; rolbypassrls: boolean; rolconnlimit: number; rolconfig: string[] }>(
      `select rolcanlogin, rolsuper, rolbypassrls, rolconnlimit, rolconfig from pg_roles where rolname = 'metabase_ro'`);
    expect(r).toMatchObject({ rolcanlogin: true, rolsuper: false, rolbypassrls: false, rolconnlimit: 5 });
    expect(r.rolconfig).toEqual(expect.arrayContaining(["default_transaction_read_only=on", "statement_timeout=60s"]));
  });

  it("anon / authenticated không đụng được schema analytics", async () => {
    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`set role ${role}`);
      try { await expect(pg.query(`select * from analytics.word_stats`)).rejects.toThrow(/permission denied/); }
      finally { await pg.exec(`reset role`); }
    }
  });
});

describe("câu hỏi Metabase (scripts/metabase/questions/*.sql)", () => {
  const dir = path.join(__dirname, "..", "..", "scripts", "metabase", "questions");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const values: Record<string, string> = {
    min_attempts: "1", min_users: "1", cefr: "'A1'", domain: "'general'", pos: "'adj'", game: "'type'", topic: "'tenses'",
  };
  const fill = (sql: string) => sql.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k] ?? "NULL");
  // Metabase: [[ ... ]] chỉ được giữ khi dashboard truyền giá trị cho biến bên trong
  const withOptionals = (sql: string) => fill(sql.replace(/\[\[|\]\]/g, ""));
  const withoutOptionals = (sql: string) => fill(sql.replace(/\[\[[\s\S]*?\]\]/g, ""));

  it("có đủ file", () => expect(files.length).toBe(28));
  for (const f of files) {
    it(`${f}: chạy được khi có và khi không có bộ lọc tuỳ chọn`, async () => {
      const sql = readFileSync(path.join(dir, f), "utf8");
      const a = await pg.query(withoutOptionals(sql));
      const b = await pg.query(withOptionals(sql));
      expect(a.fields.length).toBeGreaterThan(0);
      expect(b.fields.map((x) => x.name)).toEqual(a.fields.map((x) => x.name));
    });
  }

  it("top từ khó: 'hard' đứng đầu khi hạ ngưỡng; ngưỡng mặc định (20 lượt, 5 người) loại từ ít mẫu", async () => {
    const sql = readFileSync(path.join(dir, "01-top-tu-kho.sql"), "utf8");
    const rows = (await pg.query<{ content_key: string }>(withoutOptionals(sql))).rows;
    expect(rows[0].content_key).toBe("hard");
    const strict = (await pg.query<{ content_key: string }>(withoutOptionals(sql).replace("attempts >= 1", "attempts >= 20").replace("users >= 1", "users >= 5"))).rows;
    expect(strict.map((r) => r.content_key)).not.toContain("rare");
  });

  it("so sánh game: từ có ≥ 2 game xuất hiện cùng hàng", async () => {
    const sql = readFileSync(path.join(dir, "04-so-sanh-game.sql"), "utf8");
    const rows = (await pg.query<{ content_key: string; type: string | null; quiz: string | null }>(withoutOptionals(sql))).rows;
    // wBoth: quiz 7 lượt (1 sai), type 6 lượt (5 sai). "hard" chỉ có ≥ 5 lượt ở một game nên không vào.
    expect(rows.map((r) => r.content_key)).toEqual(["both"]);
    expect(num(rows[0].type)).toBeCloseTo(5 / 6, 3);
    expect(num(rows[0].quiz)).toBeCloseTo(1 / 7, 3);
  });
});
