import type { ManifestEntry } from "../../src/core/cosmetics";
import type { Db } from "../content/lib/db";

export type CatalogSyncReport = {
  inserted: string[];
  /** Tên hoặc độ hiếm trong code khác DB (code là gốc nên được cập nhật). */
  updated: { id: string; was: string; now: string }[];
  /** Có trong DB nhưng không còn trong code: giữ nguyên (người đã sở hữu vẫn thấy); nên đặt active=false nếu không muốn cấp nữa. */
  orphans: string[];
};

type Row = { id: string; kind: string; name: string; rarity: string | null };

/**
 * Manifest trong code → bảng `cosmetics`. Quy ước (docs/cosmetics.md): manifest chỉ là GIÁ TRỊ MẶC ĐỊNH.
 *  • món mới      → thêm với luật mở khóa, hạn, bật/tắt theo manifest
 *  • món đã có    → chỉ cập nhật tên và độ hiếm (thuộc về code); luật mở khóa, hạn, cửa nhận, bật/tắt do admin chỉnh nên KHÔNG ghi đè
 *  • id đổi loại  → lỗi (id bất biến)
 * Chạy lại bao nhiêu lần cũng được. Một giao dịch.
 */
export async function syncCatalog(db: Db, entries: readonly ManifestEntry[], opts: { dryRun?: boolean } = {}): Promise<CatalogSyncReport> {
  return db.transaction(async (tx) => {
    const existing = new Map((await tx.query<Row>(`select id, kind, name, rarity from cosmetics`)).rows.map((r) => [r.id, r]));
    const report: CatalogSyncReport = { inserted: [], updated: [], orphans: [] };
    const known = new Set(entries.map((e) => e.id));

    for (const e of entries) {
      const row = existing.get(e.id);
      if (!row) {
        report.inserted.push(e.id);
        if (!opts.dryRun) {
          await tx.query(
            `insert into cosmetics (id, kind, name, rarity, unlock, duration_days, active) values ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
            [e.id, e.kind, e.name, e.rarity, JSON.stringify(e.unlock), e.durationDays, e.active],
          );
        }
        continue;
      }
      if (row.kind !== e.kind) throw new Error(`Món "${e.id}" đổi loại ${row.kind} → ${e.kind}. id là bất biến: đặt id mới cho món mới.`);
      if (row.name !== e.name || row.rarity !== e.rarity) {
        report.updated.push({ id: e.id, was: `${row.name}${row.rarity ? ` (${row.rarity})` : ""}`, now: `${e.name}${e.rarity ? ` (${e.rarity})` : ""}` });
        if (!opts.dryRun) await tx.query(`update cosmetics set name = $2, rarity = $3, updated_at = now() where id = $1`, [e.id, e.name, e.rarity]);
      }
    }
    report.orphans = [...existing.keys()].filter((id) => !known.has(id)).sort();
    return report;
  });
}

export function formatCatalogReport(r: CatalogSyncReport): string {
  const lines = [`  thêm mới: ${r.inserted.length}${r.inserted.length ? ` (${r.inserted.join(", ")})` : ""}`, `  đổi tên/độ hiếm: ${r.updated.length}`];
  for (const u of r.updated) lines.push(`    ${u.id}: ${u.was} → ${u.now}`);
  if (r.orphans.length) lines.push(`  ⚠ có trong DB nhưng không còn trong code: ${r.orphans.join(", ")} (giữ nguyên; đặt active=false nếu không muốn cấp nữa)`);
  return lines.join("\n");
}
