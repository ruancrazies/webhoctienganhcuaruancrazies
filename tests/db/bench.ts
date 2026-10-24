import { freshDb } from "./helpers";
import { syncContent } from "../../scripts/content/lib/sync";
import type { ValidationResult } from "../../scripts/content/lib/types";

/**
 * npm run db:bench [-- 200000]
 * Nạp N từ giả (cùng đường sync thật) vào PGlite, đo thời gian, rồi EXPLAIN các truy vấn nóng và
 * kiểm tra KHÔNG có Seq Scan trên bảng nội dung lớn (mục 6.1). PGlite là Postgres thật chạy bằng WASM,
 * một luồng — thời gian chỉ mang tính tham khảo; kế hoạch truy vấn (index) mới là điều cần kiểm.
 */
const N = Number(process.argv[2] ?? 200_000);
const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"];
const POS = ["n", "v", "adj", "adv"];
const DOMAINS = ["general", "general", "general", "general", "general", "general", "medicine", "it"];

function synth(n: number): ValidationResult["data"] {
  const domains = ["general", "medicine", "it"].map((code, i) => ({ code, title: code, emoji: null, at: { tab: "domains", row: i + 2 } }));
  const topics = Array.from({ length: 60 }, (_, i) => ({
    slug: `topic-${i}`, title: `Chủ đề ${i}`, cefr: CEFR[i % 6], domain: "general", emoji: null, sort: i, at: { tab: "topics", row: i + 2 },
  }));
  const words: ValidationResult["data"]["words"] = [];
  const sentences: ValidationResult["data"]["sentences"] = [];
  for (let i = 0; i < n; i++) {
    const cefr = CEFR[Math.min(5, Math.floor((i / n) * 6))];
    const pos = POS[i % 4];
    words.push({
      key: `word${i}:${pos}:1`, en: `word${i}`, vi: `nghĩa ${i % 30000}`, viAlt: [], pos, ipa: null, cefr,
      domain: DOMAINS[i % DOMAINS.length], topics: [`topic-${i % 60}`], freqRank: i % 7 === 0 ? 1_000_000_000 : i,
      at: { tab: cefr, row: i + 2 },
    });
    sentences.push({
      key: `s${i}`, en: `This is the sentence number ${i}.`, vi: null, kind: "statement", cefr, source: null,
      words: [`word${i}:${pos}:1`], at: { tab: "sentences", row: i + 2 },
    });
  }
  const grammar = Array.from({ length: 5000 }, (_, i) => ({
    key: `g${i}`, level: CEFR[i % 5], topic: `t${i % 20}`, question: `Q ${i} ___`, options: ["a", "b", "c"], answer: 1 + (i % 3),
    explanation: null, at: { tab: "grammar", row: i + 2 },
  }));
  return { words, sentences, grammar, topics, domains };
}

const planOf = async (pg: Awaited<ReturnType<typeof freshDb>>["pg"], sql: string, params: unknown[] = []) => {
  const r = await pg.query<{ "QUERY PLAN": string }>(`explain (analyze, buffers off, timing on) ${sql}`, params);
  return r.rows.map((x) => x["QUERY PLAN"]).join("\n");
};

async function main() {
  const { pg, db } = await freshDb();
  const data = synth(N);
  console.log(`Nạp ${N} từ + ${N} câu + ${data.grammar.length} câu ngữ pháp qua syncContent …`);
  let t = Date.now();
  const r = await syncContent(db, data);
  console.log(`  lần đầu: ${((Date.now() - t) / 1000).toFixed(1)}s (thêm ${r.words.added} từ)`);
  t = Date.now();
  const r2 = await syncContent(db, data);
  console.log(`  lần hai (không đổi): ${((Date.now() - t) / 1000).toFixed(1)}s — đổi ${r2.words.changed}, thêm ${r2.words.added}`);
  t = Date.now();
  const d3 = structuredClone(data);
  for (let i = 0; i < 500; i++) d3.words[i * 7].vi = `đã sửa ${i}`;
  const r3 = await syncContent(db, d3);
  console.log(`  sửa 500 từ: ${((Date.now() - t) / 1000).toFixed(1)}s — đổi ${r3.words.changed}`);
  await pg.exec("analyze");

  const q = {
    "pickWords mới (rand >= r)": [`select id, en, vi from words where cefr = 'B1' and domain = 'general' and status = 'active' and rand >= 0.37 order by rand limit 60`],
    "pickWords quay vòng": [`select id, en, vi from words where cefr = 'B1' and domain = 'general' and status = 'active' order by rand limit 60`],
    "đáp án nhiễu (pos, cefr gần)": [`select vi from words where pos = 'n' and cefr in ('A2','B1') and vi <> 'x' and status = 'active' and rand >= 0.4 order by rand limit 3`],
    "danh sách học keyset": [`select id, en, vi from words where cefr = 'B1' and domain = 'general' and status = 'active' and (freq_rank, id) > (60000, 1) order by freq_rank, id limit 30`],
    "ví dụ của 30 từ": [`select sw.word_id, s.en from sentence_words sw join sentences s on s.id = sw.sentence_id where sw.word_id = any (select id from words where cefr = 'B1' and domain = 'general' and status = 'active' order by freq_rank, id limit 30)`],
    // lấy dư id theo (topic_id, rand) rồi mới nối words để lọc status
    "chọn theo chủ đề": [`select w.id, w.en from (select word_id from word_topics where topic_id = (select id from topics where slug = 'topic-5') and rand >= 0.5 order by rand limit 90) x join words w on w.id = x.word_id where w.status = 'active' limit 30`],
    "đề thi từ vựng (general của cấp)": [`select id, en, vi, pos from words where cefr = 'C1' and domain = 'general' and status = 'active' and rand >= 0.81 order by rand limit 40`],
    "đề thi ngữ pháp": [`select id, question from grammar_questions where level = 'B2' and status = 'active' and rand >= 0.3 order by rand limit 10`],
    "tìm từ (trigram, ép dùng index)": [`select id, en from words where en ilike '%rd1234%' limit 20`],
    "content_stats cấp": [`select domain, sum(word_count)::int from content_stats where topic_id is null and cefr = 'B1' group by domain`],
  } as const;

  const BIG = /Seq Scan on (words|sentences|sentence_words|word_topics)\b/;
  let bad = 0;
  console.log("\nEXPLAIN (thời gian thực thi trên PGlite, tham khảo):");
  for (const [name, [sql]] of Object.entries(q)) {
    // Trigram: dữ liệu giả có tên gần giống nhau nên planner có thể chọn quét tuần tự khi có LIMIT;
    // ở đây chỉ chứng minh index dùng được (tắt seqscan tạm thời).
    const forceIndex = name.startsWith("tìm từ");
    if (forceIndex) await pg.exec("set enable_seqscan = off");
    const plan = await planOf(pg, sql);
    if (forceIndex) await pg.exec("reset enable_seqscan");
    const ms = /Execution Time: ([\d.]+) ms/.exec(plan)?.[1];
    const seq = BIG.exec(plan);
    if (seq) bad++;
    console.log(`  ${seq ? "✖" : "✔"} ${name.padEnd(36)} ${ms?.padStart(8)} ms  ${seq ? `<-- ${seq[0]}` : (/(Index(?: Only)? Scan|Bitmap Index Scan) (?:Backward )?using (\w+)/.exec(plan)?.[2] ?? "")}`);
    if (seq) console.log(plan.split("\n").map((l) => "      " + l).join("\n"));
  }
  const sizes = await pg.query<{ t: string; n: string }>(
    `select relname t, pg_size_pretty(pg_total_relation_size(oid)) n from pg_class where relname in ('words','sentences','sentence_words','word_topics') order by relname`,
  );
  console.log("\nDung lượng (gồm index):", sizes.rows.map((x) => `${x.t} ${x.n}`).join(" · "));
  await pg.close();
  if (bad) {
    console.error(`\n✖ ${bad} truy vấn còn Seq Scan trên bảng nội dung`);
    process.exit(1);
  }
  console.log("\n✔ Không có Seq Scan trên bảng nội dung.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
