import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { connectPg, resolveDatabaseUrl, type Db } from "./lib/db";
import { loadEnv } from "./lib/env";

/**
 * npm run content:export [-- --target local|staging|prod] [--out content/backup]
 * Xuất nội dung trong DB ra JSONL (sao lưu, có diff khi commit). Sắp theo id nên ổn định giữa các lần xuất.
 * Không xuất dữ liệu người dùng (xem mục 6.3: pg_dump riêng, không commit).
 */
const PAGE = 10000;

async function dump(db: Db, file: string, sql: string, strip: string[] = ["id"]): Promise<number> {
  writeFileSync(file, "");
  let cursor = "0";
  let total = 0;
  for (;;) {
    const { rows } = await db.query<Record<string, unknown>>(sql, [cursor, PAGE]);
    if (rows.length === 0) break;
    let out = "";
    for (const r of rows) {
      const o = { ...r };
      for (const k of strip) delete o[k];
      out += JSON.stringify(o) + "\n";
    }
    appendFileSync(file, out);
    total += rows.length;
    cursor = String(rows[rows.length - 1].id);
    if (rows.length < PAGE) break;
  }
  return total;
}

async function main() {
  loadEnv();
  const { values } = parseArgs({ options: { target: { type: "string", default: "local" }, out: { type: "string", default: "content/backup" } } });
  const out = values.out as string;
  mkdirSync(out, { recursive: true });
  const db = connectPg(resolveDatabaseUrl(values.target as string));
  try {
    const jobs: [string, string][] = [
      ["domains", `select code as id, code, title, emoji from domains where code > $1 order by code limit $2`],
      ["topics", `select id, slug, title, emoji, cefr, domain, sort from topics where id > $1::bigint order by id limit $2`],
      ["words", `select w.id, w.key, w.en, w.pos, w.vi, w.vi_alt, w.ipa, w.cefr, w.freq_rank, w.domain, w.quality, w.status, w.rand,
                        coalesce((select array_agg(tp.slug order by tp.slug) from word_topics wt join topics tp on tp.id = wt.topic_id
                                   where wt.word_id = w.id), '{}') as topics
                   from words w where w.id > $1::bigint order by w.id limit $2`],
      ["sentences", `select s.id, s.key, s.en, s.vi, s.cefr, s.kind, s.source, s.status,
                            coalesce((select array_agg(w.key order by w.key) from sentence_words sw join words w on w.id = sw.word_id
                                       where sw.sentence_id = s.id), '{}') as words
                       from sentences s where s.id > $1::bigint order by s.id limit $2`],
      ["grammar", `select id, key, level, topic, question, options, answer, explanation, status, rand
                     from grammar_questions where id > $1::bigint order by id limit $2`],
    ];
    for (const [name, sql] of jobs) {
      const file = path.join(out, `${name}.jsonl`);
      const n = await dump(db, file, sql, ["id"]);
      console.log(`  ✔ ${name.padEnd(10)} ${String(n).padStart(8)} dòng → ${file}`);
    }
  } finally {
    await db.close();
  }
}

main().catch((e) => {
  console.error(`\n✖ ${(e as Error).message}`);
  process.exit(1);
});
