import { parseArgs } from "node:util";
import { manifestEntries } from "../../src/cosmetics/registry";
import { connectPg, resolveDatabaseUrl } from "../content/lib/db";
import { loadEnv } from "../content/lib/env";
import { formatCatalogReport, syncCatalog } from "./sync-lib";

/**
 * npm run cosmetics:sync [-- --dry-run] [--target local|staging|prod] [--yes]
 *
 * Manifest trong src/cosmetics → bảng `cosmetics`. Món mới lấy mặc định từ manifest; món đã có chỉ cập nhật tên/độ hiếm,
 * phần admin chỉnh (luật mở khóa, hạn, cửa nhận, bật/tắt) không bị ghi đè. Chạy sau mỗi lần deploy có thêm món mới.
 */
async function main() {
  loadEnv();
  const { values } = parseArgs({
    options: { "dry-run": { type: "boolean", default: false }, target: { type: "string", default: "local" }, yes: { type: "boolean", default: false } },
  });
  const target = values.target as string;
  const dryRun = values["dry-run"] as boolean;
  if (target === "prod" && !dryRun && !values.yes) throw new Error("Ghi vào prod cần thêm --yes (hoặc chạy --dry-run để xem trước).");

  const entries = manifestEntries();
  const db = connectPg(resolveDatabaseUrl(target));
  try {
    console.log(`Đồng bộ ${entries.length} món vào DB "${target}"${dryRun ? " (dry-run)" : ""} …`);
    console.log(formatCatalogReport(await syncCatalog(db, entries, { dryRun })));
    console.log(dryRun ? "✔ Dry-run xong." : "✔ Đã ghi.");
  } finally {
    await db.close();
  }
}

main().catch((e) => {
  console.error(`\n✖ ${(e as Error).message}`);
  process.exit(1);
});
