import { parseArgs } from "node:util";
import { loadSheetConfig } from "../../content/schema/config";
import { connectPg, resolveDatabaseUrl } from "./lib/db";
import { loadEnv } from "./lib/env";
import { printIssues } from "./lib/report";
import { loadContent } from "./lib/sheet";
import { formatReport, syncContent } from "./lib/sync";
import { validateContent } from "./lib/validate";

/**
 * npm run content:sync [-- --dry-run] [--retire-missing] [--force] [--from-dir <thư mục CSV>]
 *                       [--target local|staging|prod] [--yes]
 *
 * Google Sheet → kiểm tra định dạng → so theo key → upsert vào Postgres (một giao dịch).
 *   --dry-run         chỉ in khác biệt, không ghi gì
 *   --retire-missing  key vắng trên Sheet → status = 'retired' (không xóa; tiến độ người dùng giữ nguyên)
 *   --force           bỏ ngưỡng chặn retire hàng loạt (> 2% mục active)
 *   --target          chọn DB: DATABASE_URL_LOCAL (mặc định: Supabase local) | _STAGING | _PROD
 *   --yes             bắt buộc khi ghi vào prod
 */
async function main() {
  loadEnv();
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      "retire-missing": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      "from-dir": { type: "string" },
      target: { type: "string", default: "local" },
      yes: { type: "boolean", default: false },
    },
  });
  const target = values.target as string;
  const dryRun = values["dry-run"] as boolean;
  if (target === "prod" && !dryRun && !values.yes) {
    throw new Error("Ghi vào prod cần thêm --yes (hoặc chạy --dry-run để xem trước).");
  }

  const cfg = loadSheetConfig();
  console.log(`Đọc nội dung từ ${values["from-dir"] ? `thư mục ${values["from-dir"]}` : `Google Sheet ${cfg.sheetId}`} …`);
  const loaded = await loadContent(cfg, { fromDir: values["from-dir"] });
  const result = validateContent(loaded.tabs, cfg);
  const issues = [...loaded.loadIssues, ...result.issues];
  const errors = issues.filter((i) => i.level === "error").length;
  if (errors > 0) {
    printIssues(issues.filter((i) => i.level === "error"));
    console.error(`\n✖ ${errors} lỗi định dạng — dừng, chưa ghi gì vào DB. Sửa trên Sheet rồi chạy lại.`);
    process.exit(1);
  }
  console.log(`Hợp lệ: ${result.data.words.length} từ · ${result.data.sentences.length} câu · ${result.data.grammar.length} ngữ pháp (${issues.length} cảnh báo)`);

  const db = connectPg(resolveDatabaseUrl(target));
  try {
    console.log(`Đồng bộ vào DB "${target}"${dryRun ? " (dry-run)" : ""} …`);
    const t0 = Date.now();
    const report = await syncContent(db, result.data, {
      dryRun,
      retireMissing: values["retire-missing"] as boolean,
      force: values.force as boolean,
    });
    console.log(formatReport(report));
    console.log(`\n${report.blocked ? "✖ Không ghi gì." : dryRun ? "✔ Dry-run xong." : "✔ Đã ghi"} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    process.exit(report.blocked ? 1 : 0);
  } finally {
    await db.close();
  }
}

main().catch((e) => {
  console.error(`\n✖ ${(e as Error).message}`);
  process.exit(1);
});
