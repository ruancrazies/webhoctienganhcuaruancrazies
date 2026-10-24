import { createHash } from "node:crypto";
import type { Db } from "./db";
import type { ValidationResult } from "./types";

export type SyncOptions = {
  dryRun?: boolean;
  /** Key vắng trên Sheet → đổi status = 'retired' (không xóa). Không có cờ này chỉ cảnh báo. */
  retireMissing?: boolean;
  /** Bỏ qua ngưỡng chặn retire hàng loạt. */
  force?: boolean;
  /** Tỉ lệ tối đa số mục active được phép retired trong một lần sync (mặc định 2%). */
  retireThreshold?: number;
  batchSize?: number;
};

export type EntityDiff = {
  added: number;
  changed: number; // đổi nội dung hoặc từ retired/draft xuất hiện lại
  unchanged: number;
  missing: number; // đang active ở DB nhưng vắng trên Sheet
  moved?: number; // (words) đổi cefr/domain, giữ key
  retired: number; // số thực sự bị retired trong lần này
  samples: { added: string[]; changed: string[]; missing: string[] };
};

export type SyncReport = {
  dryRun: boolean;
  blocked?: string;
  sheetHash: string;
  domains: number;
  topics: number;
  words: EntityDiff;
  sentences: EntityDiff;
  grammar: EntityDiff;
};

const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const SAMPLE = 10;

type Col = [name: string, type: string];

/** Nạp bản ghi vào bảng tạm theo lô (jsonb_to_recordset), kèm cột seq để chia lô khi upsert. */
async function stage(tx: Db, table: string, cols: Col[], rows: object[], batch: number): Promise<void> {
  const def = ["seq int", ...cols.map(([n, t]) => `${n} ${t}`)].join(", ");
  await tx.query(`create temp table ${table} (${def}, flagged boolean not null default false) on commit drop`);
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch).map((r, j) => ({ seq: i + j, ...r }));
    await tx.query(`insert into ${table} (${["seq", ...cols.map((c) => c[0])].join(", ")})
                    select * from jsonb_to_recordset($1::jsonb) as x(${def})`, [JSON.stringify(chunk)]);
  }
  await tx.query(`create unique index on ${table} (key)`);
}

/** Đánh dấu dòng cần ghi (mới / đổi băm / đang không active) rồi đếm khác biệt so với bảng thật. */
async function diff(tx: Db, table: string, stg: string, withMoved: boolean): Promise<EntityDiff> {
  await tx.query(`update ${stg} s set flagged = true
                   where not exists (select 1 from ${table} t
                                      where t.key = s.key and t.content_hash = s.content_hash and t.status = 'active')`);
  const counts = (
    await tx.query<{ added: number; changed: number; unchanged: number; moved: number }>(
      `select count(*) filter (where t.id is null)::int as added,
              count(*) filter (where t.id is not null and s.flagged)::int as changed,
              count(*) filter (where not s.flagged)::int as unchanged,
              ${withMoved ? "count(*) filter (where t.id is not null and (t.cefr <> s.cefr or t.domain <> s.domain))::int" : "0"} as moved
         from ${stg} s left join ${table} t on t.key = s.key`,
    )
  ).rows[0];
  const missingWhere = `t.status = 'active' and not exists (select 1 from ${stg} s where s.key = t.key)`;
  const missing = (await tx.query<{ n: number }>(`select count(*)::int n from ${table} t where ${missingWhere}`)).rows[0].n;
  const sample = async (sql: string) => (await tx.query<{ key: string }>(`${sql} limit ${SAMPLE}`)).rows.map((r) => r.key);
  return {
    added: counts.added,
    changed: counts.changed,
    unchanged: counts.unchanged,
    missing,
    moved: withMoved ? counts.moved : undefined,
    retired: 0,
    samples: {
      added: await sample(`select s.key from ${stg} s left join ${table} t on t.key = s.key where t.id is null order by s.seq`),
      changed: await sample(`select s.key from ${stg} s join ${table} t on t.key = s.key where s.flagged order by s.seq`),
      missing: await sample(`select t.key from ${table} t where ${missingWhere} order by t.key`),
    },
  };
}

async function retire(tx: Db, table: string, stg: string): Promise<number> {
  return (
    await tx.query<{ n: number }>(
      `with r as (update ${table} set status = 'retired', updated_at = now()
                   where status = 'active' and not exists (select 1 from ${stg} s where s.key = ${table}.key)
               returning 1)
       select count(*)::int n from r`,
    )
  ).rows[0].n;
}

const activeCount = async (tx: Db, table: string) =>
  (await tx.query<{ n: number }>(`select count(*)::int n from ${table} where status = 'active'`)).rows[0].n;

/**
 * Đồng bộ nội dung đã kiểm tra (ValidationResult.data) vào Postgres, trong MỘT giao dịch:
 * so theo `key` bằng content_hash, chỉ ghi dòng thêm/đổi; `rand` của từ cũ giữ nguyên;
 * không bao giờ xóa (retire khi có retireMissing); làm mới content_stats; ghi content_imports.
 * Gọi khi KHÔNG còn lỗi validate.
 */
export async function syncContent(db: Db, data: ValidationResult["data"], opts: SyncOptions = {}): Promise<SyncReport> {
  const batch = opts.batchSize ?? 5000;
  const threshold = opts.retireThreshold ?? 0.02;

  const words = data.words.map((w) => ({
    key: w.key, en: w.en, pos: w.pos, vi: w.vi, vi_alt: w.viAlt, ipa: w.ipa, cefr: w.cefr,
    domain: w.domain, freq_rank: w.freqRank, topics: w.topics,
    content_hash: sha([w.en, w.pos, w.vi, w.viAlt, w.ipa, w.cefr, w.domain, [...w.topics].sort(), w.freqRank]),
  }));
  const sentences = data.sentences.map((s) => ({
    key: s.key, en: s.en, vi: s.vi, cefr: s.cefr, kind: s.kind, source: s.source, words: s.words,
    content_hash: sha([s.en, s.vi, s.cefr, s.kind, s.source, [...s.words].sort()]),
  }));
  const grammar = data.grammar.map((g) => ({
    key: g.key, level: g.level, topic: g.topic, question: g.question, options: g.options,
    answer: g.answer, explanation: g.explanation,
    content_hash: sha([g.level, g.topic, g.question, g.options, g.answer, g.explanation]),
  }));
  const sheetHash = sha([words, sentences, grammar, data.topics, data.domains]);

  return db.transaction(async (tx) => {
    await tx.query("set local statement_timeout = '15min'");

    await stage(tx, "stg_words", [
      ["key", "text"], ["en", "text"], ["pos", "text"], ["vi", "text"], ["vi_alt", "jsonb"], ["ipa", "text"],
      ["cefr", "text"], ["domain", "text"], ["freq_rank", "int"], ["topics", "jsonb"], ["content_hash", "text"],
    ], words, batch);
    await stage(tx, "stg_sentences", [
      ["key", "text"], ["en", "text"], ["vi", "text"], ["cefr", "text"], ["kind", "text"], ["source", "text"],
      ["words", "jsonb"], ["content_hash", "text"],
    ], sentences, batch);
    await stage(tx, "stg_grammar", [
      ["key", "text"], ["level", "text"], ["topic", "text"], ["question", "text"], ["options", "jsonb"],
      ["answer", "int"], ["explanation", "text"], ["content_hash", "text"],
    ], grammar, batch);

    const report: SyncReport = {
      dryRun: !!opts.dryRun,
      sheetHash,
      domains: data.domains.length,
      topics: data.topics.length,
      words: await diff(tx, "words", "stg_words", true),
      sentences: await diff(tx, "sentences", "stg_sentences", false),
      grammar: await diff(tx, "grammar_questions", "stg_grammar", false),
    };

    // Chặn retire hàng loạt do nhầm (xóa/sửa nhầm cả cột trên Sheet) — chỉ khi định retire.
    if (opts.retireMissing && !opts.force) {
      for (const [name, table] of [["words", "words"], ["sentences", "sentences"], ["grammar", "grammar_questions"]] as const) {
        const d = report[name];
        const active = await activeCount(tx, table);
        if (d.missing > 0 && d.missing > active * threshold) {
          report.blocked = `Sẽ retire ${d.missing}/${active} ${name} (> ${(threshold * 100).toFixed(0)}%). Kiểm tra Sheet có bị xóa nhầm không; nếu đúng ý thì thêm --force.`;
          break;
        }
      }
    }
    if (opts.dryRun || report.blocked) return report;

    // ---- domains, topics ----
    await tx.query(
      `insert into domains (code, title, emoji)
       select code, title, emoji from jsonb_to_recordset($1::jsonb) as x(code text, title text, emoji text)
       on conflict (code) do update set title = excluded.title, emoji = excluded.emoji`,
      [JSON.stringify(data.domains.map((d) => ({ code: d.code, title: d.title, emoji: d.emoji })))],
    );
    await tx.query(
      `insert into topics (slug, title, emoji, cefr, domain, sort)
       select slug, title, emoji, cefr, domain, sort
         from jsonb_to_recordset($1::jsonb) as x(slug text, title text, emoji text, cefr text, domain text, sort int)
       on conflict (slug) do update
         set title = excluded.title, emoji = excluded.emoji, cefr = excluded.cefr,
             domain = excluded.domain, sort = excluded.sort`,
      [JSON.stringify(data.topics.map((t) => ({ slug: t.slug, title: t.title, emoji: t.emoji, cefr: t.cefr, domain: t.domain, sort: t.sort })))],
    );

    // Người dùng có từ đổi cefr/domain: cần sửa tiến độ và tính lại bộ đếm (dữ liệu sao chép ở user_word_progress).
    if ((report.words.moved ?? 0) > 0) {
      await tx.query(
        `create temp table moved_users on commit drop as
           select distinct p.user_id from user_word_progress p
             join words w on w.id = p.word_id
             join stg_words s on s.key = w.key
            where w.cefr <> s.cefr or w.domain <> s.domain`,
      );
    }

    // ---- words ----
    for (let from = 0; from < words.length; from += batch) {
      await tx.query(
        `insert into words (key, en, pos, vi, vi_alt, ipa, cefr, freq_rank, domain, status, content_hash, updated_at)
         select s.key, s.en, s.pos, s.vi, array(select jsonb_array_elements_text(s.vi_alt)), s.ipa, s.cefr,
                s.freq_rank, s.domain, 'active', s.content_hash, now()
           from stg_words s
          where s.flagged and s.seq >= $1 and s.seq < $2
         on conflict (key) do update
           set en = excluded.en, pos = excluded.pos, vi = excluded.vi, vi_alt = excluded.vi_alt,
               ipa = excluded.ipa, cefr = excluded.cefr, freq_rank = excluded.freq_rank,
               domain = excluded.domain, status = 'active',
               content_hash = excluded.content_hash, updated_at = now()`, // rand KHÔNG bị ghi đè
        [from, from + batch],
      );
    }
    await tx.query(
      `delete from word_topics where word_id in (select w.id from words w join stg_words s on s.key = w.key where s.flagged)`,
    );
    await tx.query(
      `insert into word_topics (topic_id, word_id, rand)
       select tp.id, w.id, w.rand
         from stg_words s
         join words w on w.key = s.key
         cross join lateral jsonb_array_elements_text(s.topics) e(slug)
         join topics tp on tp.slug = e.slug
        where s.flagged
       on conflict do nothing`,
    );
    if ((report.words.moved ?? 0) > 0) {
      await tx.query(
        `update user_word_progress p set cefr = w.cefr, domain = w.domain
           from words w where w.id = p.word_id and (p.cefr <> w.cefr or p.domain <> w.domain)`,
      );
      await tx.query(`delete from user_level_stats where user_id in (select user_id from moved_users)`);
      await tx.query(
        `insert into user_level_stats (user_id, cefr, domain, learned, mastered)
         select user_id, cefr, domain, count(*) filter (where level >= 1), count(*) filter (where level >= 3)
           from user_word_progress where user_id in (select user_id from moved_users)
          group by user_id, cefr, domain`,
      );
    }
    if (opts.retireMissing) report.words.retired = await retire(tx, "words", "stg_words");

    // ---- sentences ----
    for (let from = 0; from < sentences.length; from += batch) {
      await tx.query(
        `insert into sentences (key, en, vi, cefr, kind, source, status, content_hash, updated_at)
         select s.key, s.en, s.vi, s.cefr, s.kind, s.source, 'active', s.content_hash, now()
           from stg_sentences s where s.flagged and s.seq >= $1 and s.seq < $2
         on conflict (key) do update
           set en = excluded.en, vi = excluded.vi, cefr = excluded.cefr, kind = excluded.kind,
               source = excluded.source, status = 'active', content_hash = excluded.content_hash, updated_at = now()`,
        [from, from + batch],
      );
    }
    await tx.query(
      `delete from sentence_words where sentence_id in (select t.id from sentences t join stg_sentences s on s.key = t.key where s.flagged)`,
    );
    await tx.query(
      `insert into sentence_words (word_id, sentence_id)
       select w.id, t.id
         from stg_sentences s
         join sentences t on t.key = s.key
         cross join lateral jsonb_array_elements_text(s.words) e(wkey)
         join words w on w.key = e.wkey
        where s.flagged
       on conflict do nothing`,
    );
    if (opts.retireMissing) report.sentences.retired = await retire(tx, "sentences", "stg_sentences");

    // ---- grammar ----
    for (let from = 0; from < grammar.length; from += batch) {
      await tx.query(
        `insert into grammar_questions (key, level, topic, question, options, answer, explanation, status, content_hash, updated_at)
         select s.key, s.level, s.topic, s.question, s.options, s.answer, s.explanation, 'active', s.content_hash, now()
           from stg_grammar s where s.flagged and s.seq >= $1 and s.seq < $2
         on conflict (key) do update
           set level = excluded.level, topic = excluded.topic, question = excluded.question,
               options = excluded.options, answer = excluded.answer, explanation = excluded.explanation,
               status = 'active', content_hash = excluded.content_hash, updated_at = now()`,
        [from, from + batch],
      );
    }
    if (opts.retireMissing) report.grammar.retired = await retire(tx, "grammar_questions", "stg_grammar");

    // ---- hoàn tất ----
    await tx.query("select refresh_content_stats()");
    if (report.words.added + report.words.changed > 1000) await tx.query("analyze words, sentences, sentence_words, word_topics");

    const added = report.words.added + report.sentences.added + report.grammar.added;
    const updated = report.words.changed + report.sentences.changed + report.grammar.changed;
    const retired = report.words.retired + report.sentences.retired + report.grammar.retired;
    await tx.query(
      `insert into content_imports (sheet_hash, added, updated, retired, details) values ($1, $2, $3, $4, $5::jsonb)`,
      [sheetHash, added, updated, retired, JSON.stringify({ words: report.words, sentences: report.sentences, grammar: report.grammar })],
    );
    return report;
  });
}

export function formatReport(r: SyncReport): string {
  const line = (name: string, d: EntityDiff) =>
    `  ${name.padEnd(10)} +${d.added} mới · ~${d.changed} sửa · =${d.unchanged} giữ nguyên · ${d.missing} vắng trên Sheet` +
    (d.moved ? ` · ${d.moved} đổi cấp/lĩnh vực` : "") +
    (d.retired ? ` · ${d.retired} đã retired` : "");
  const out = [`${r.dryRun ? "[DRY-RUN] " : ""}Kết quả đồng bộ (${r.domains} lĩnh vực, ${r.topics} chủ đề)`];
  for (const [name, d] of [["từ", r.words], ["câu", r.sentences], ["ngữ pháp", r.grammar]] as const) {
    out.push(line(name, d));
    for (const [label, keys] of [["mới", d.samples.added], ["sửa", d.samples.changed], ["vắng", d.samples.missing]] as const) {
      if (keys.length) out.push(`      ${label}: ${keys.join(", ")}${(label === "mới" ? d.added : label === "sửa" ? d.changed : d.missing) > keys.length ? ", …" : ""}`);
    }
  }
  const missing = r.words.missing + r.sentences.missing + r.grammar.missing;
  if (missing && !r.words.retired && !r.sentences.retired && !r.grammar.retired && !r.blocked) {
    out.push(`  ⚠ ${missing} mục vắng trên Sheet nhưng vẫn active (thêm --retire-missing để ngừng dùng).`);
  }
  if (r.blocked) out.push(`  ✖ DỪNG: ${r.blocked}`);
  return out.join("\n");
}
