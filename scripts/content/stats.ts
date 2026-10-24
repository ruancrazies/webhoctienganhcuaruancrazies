import { parseArgs } from "node:util";
import { loadSheetConfig } from "../../content/schema/config";
import { loadEnv } from "./lib/env";
import { loadContent } from "./lib/sheet";
import { computeStats, withTotals } from "./lib/stats";
import { validateContent } from "./lib/validate";

/** npm run content:stats [-- --from-dir <thư mục CSV>] — đếm từ theo cefr × domain và cefr × pos. */
async function main() {
  loadEnv();
  const { values } = parseArgs({ options: { "from-dir": { type: "string" } } });
  const cfg = loadSheetConfig();
  const loaded = await loadContent(cfg, { fromDir: values["from-dir"] });
  const result = validateContent(loaded.tabs, cfg);

  const stats = computeStats(result.data.words);
  const skipped = result.wordRowCount - stats.total;
  console.log(`Tổng ${stats.total} từ hợp lệ${skipped > 0 ? ` (bỏ qua ${skipped} dòng lỗi — chạy content:validate để xem)` : ""}`);
  console.log("\nCEFR × lĩnh vực");
  console.table(withTotals(stats.byCefrDomain));
  console.log("CEFR × loại từ");
  console.table(withTotals(stats.byCefrPos));
}

main().catch((e) => {
  console.error(`\n✖ ${(e as Error).message}`);
  process.exit(1);
});
