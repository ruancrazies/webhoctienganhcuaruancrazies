import { loadSheetConfig } from "../../content/schema/config";
import { loadEnv } from "./lib/env";
import { loadContent } from "./lib/sheet";

/**
 * npm run content:probe — thử tải CSV từng tab từ Google Sheet và báo kích thước, số dòng, thời gian.
 * Dùng sớm với tab lớn để biết CSV có bị chậm/cắt không (kế hoạch Bước 0). Nếu có,
 * chuyển sheet.ts sang Sheets API (`batchGet` theo đoạn).
 */
async function main() {
  loadEnv();
  const cfg = loadSheetConfig();
  const t0 = Date.now();
  const loaded = await loadContent(cfg);
  console.log("tab          dòng       KB      ms   kết thúc đủ dòng");
  for (const m of loaded.meta) {
    const flag = m.endsCleanly ? "✔" : "⚠ file không kết thúc bằng xuống dòng — có thể bị cắt";
    console.log(`${m.tab.padEnd(10)} ${String(m.rows).padStart(8)} ${(m.bytes / 1024).toFixed(0).padStart(8)} ${String(m.ms).padStart(7)}   ${flag}`);
  }
  console.log(`\nTổng ${Date.now() - t0} ms. So sánh số dòng với số dòng thật trên Sheet để chắc chắn không bị cắt.`);
}

main().catch((e) => {
  console.error(`\n✖ ${(e as Error).message}`);
  process.exit(1);
});
