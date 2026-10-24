import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { loadSheetConfig } from "../../content/schema/config";
import { loadEnv } from "./lib/env";
import { keyColumnLines, planKeys } from "./lib/genkeys";
import { printIssues } from "./lib/report";
import { loadContent } from "./lib/sheet";

/**
 * npm run content:genkeys [-- --from-dir <thư mục CSV>] [--write]
 *
 * Điền `key` (en:pos:n) cho các dòng chưa có key trên MỌI tab từ vựng.
 * - Mặc định: ghi cột key vào content/import/keys-<tab>.txt (mỗi dòng ứng với một dòng của tab,
 *   dòng đầu là tiêu đề "key") để bạn dán vào cột `key` trên Sheet.
 * - --write (chỉ với --from-dir): sửa trực tiếp các file CSV.
 */
async function main() {
  loadEnv();
  const { values } = parseArgs({
    options: { "from-dir": { type: "string" }, write: { type: "boolean", default: false } },
  });
  const fromDir = values["from-dir"];
  if (values.write && !fromDir) {
    throw new Error("--write chỉ dùng với --from-dir (không ghi ngược lên Google Sheet được từ script này).");
  }

  const cfg = loadSheetConfig();
  const loaded = await loadContent(cfg, { fromDir });
  const plan = planKeys(loaded.tabs, cfg.wordTabs.map((t) => t.name));

  printIssues(plan.issues);
  if (plan.assigned === 0) {
    console.log("\nKhông có dòng nào cần sinh key.");
    process.exit(plan.issues.length ? 1 : 0);
  }

  if (values.write && fromDir) {
    for (const [tabName, fresh] of plan.byTab) {
      const file = path.join(fromDir, `${tabName}.csv`);
      const records: string[][] = parse(readFileSync(file, "utf8"), {
        bom: true, relax_column_count: true, relax_quotes: true, skip_empty_lines: false,
      });
      const keyIdx = records[0].findIndex((h) => h.normalize("NFC").trim() === "key");
      for (const [row, key] of fresh) {
        const rec = records[row - 1];
        while (rec.length <= keyIdx) rec.push("");
        rec[keyIdx] = key;
      }
      writeFileSync(file, stringify(records), "utf8");
      console.log(`  ✔ ${tabName}: đã điền ${fresh.size} key vào ${file}`);
    }
  } else {
    const outDir = path.join("content", "import");
    mkdirSync(outDir, { recursive: true });
    for (const [tabName, fresh] of plan.byTab) {
      const lines = keyColumnLines(loaded.tabs.get(tabName)!, fresh);
      const file = path.join(outDir, `keys-${tabName}.txt`);
      writeFileSync(file, lines.join("\n") + "\n", "utf8");
      console.log(`  ✔ ${tabName}: ${fresh.size} key mới → ${file}`);
    }
    console.log('\nCách dùng: mở file .txt, chép toàn bộ, dán vào ô tiêu đề "key" của tab (cột key phải được mở khóa tạm nếu đang bảo vệ).');
  }
  console.log(`\nTổng cộng ${plan.assigned} key mới. Hãy chạy lại content:validate để kiểm tra.`);
  process.exit(plan.issues.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n✖ ${(e as Error).message}`);
  process.exit(1);
});
