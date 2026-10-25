import { parseArgs } from "node:util";
import { loadSheetConfig } from "../../content/schema/config";
import { loadEnv } from "./lib/env";
import { printIssues } from "./lib/report";
import { loadContent } from "./lib/sheet";
import { validateContent } from "./lib/validate";

/**
 * npm run content:validate [-- --from-dir <thư mục CSV>]
 * Kiểm tra ĐỊNH DẠNG nội dung trên Sheet; thoát mã 1 nếu có lỗi.
 */
async function main() {
  loadEnv();
  const { values } = parseArgs({ options: { "from-dir": { type: "string" } } });
  const cfg = loadSheetConfig();

  const src = values["from-dir"] ? `thư mục ${values["from-dir"]}` : `Google Sheet ${cfg.sheetId}`;
  console.log(`Đọc nội dung từ ${src} …`);
  const loaded = await loadContent(cfg, { fromDir: values["from-dir"] });
  for (const m of loaded.meta) {
    console.log(`  ${m.tab.padEnd(10)} ${String(m.rows).padStart(8)} dòng  ${(m.bytes / 1024).toFixed(0).padStart(7)} KB  ${m.ms} ms`);
  }

  const result = validateContent(loaded.tabs, cfg);
  const issues = [...loaded.loadIssues, ...result.issues];
  const errors = issues.filter((i) => i.level === "error").length;
  const warns = issues.length - errors;

  printIssues(issues);
  const d = result.data;
  console.log(
    `\nHợp lệ: ${d.words.length}/${result.wordRowCount} từ · ${d.sentences.length} câu · ${d.grammar.length} câu ngữ pháp · ${d.passages.length} bài đọc/nghe (${d.passageQuestions.length} câu hỏi) · ${d.topics.length} chủ đề · ${d.domains.length} lĩnh vực`,
  );
  console.log(errors > 0 ? `\n✖ ${errors} lỗi, ${warns} cảnh báo — KHÔNG được nạp.` : `\n✔ Không có lỗi (${warns} cảnh báo).`);
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n✖ ${(e as Error).message}`);
  process.exit(1);
});
