import { parse } from "csv-parse/sync";
import type { Issue, TabData } from "./types";

/**
 * Đọc CSV (UTF-8) của một tab thành TabData.
 * - Tiêu đề và ô được cắt khoảng trắng và chuẩn hóa Unicode NFC (tiếng Việt).
 * - Dòng trống hoàn toàn bị bỏ qua nhưng số dòng gốc vẫn được giữ.
 */
export function parseTab(name: string, text: string): { tab: TabData; issues: Issue[] } {
  const head = text.slice(0, 200).trimStart().toLowerCase();
  if (head.startsWith("<!doctype") || head.startsWith("<html")) {
    throw new Error(
      `Tab "${name}": nhận được trang HTML thay vì CSV (Sheet chưa chia sẻ "ai có link: chỉ đọc", hoặc sai tab/gid).`,
    );
  }

  const records: string[][] = parse(text, {
    bom: true,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: false,
  });

  const issues: Issue[] = [];
  if (records.length === 0) {
    issues.push({ level: "error", tab: name, code: "EMPTY_TAB", msg: "Tab trống (không có cả hàng tiêu đề)" });
    return { tab: { name, headers: [], rows: [], lastRow: 0 }, issues };
  }

  const seen = new Set<string>();
  const cols: { name: string; idx: number }[] = [];
  records[0].forEach((raw, idx) => {
    const h = raw.normalize("NFC").trim();
    if (!h) return; // cột không có tiêu đề: bỏ qua
    if (seen.has(h)) {
      issues.push({ level: "error", tab: name, row: 1, code: "DUP_COLUMN", msg: `Cột "${h}" xuất hiện hai lần` });
      return;
    }
    seen.add(h);
    cols.push({ name: h, idx });
  });

  const rows: TabData["rows"] = [];
  for (let i = 1; i < records.length; i++) {
    const rec = records[i];
    const v: Record<string, string> = {};
    let any = false;
    for (const c of cols) {
      const val = (rec[c.idx] ?? "").normalize("NFC").trim();
      v[c.name] = val;
      if (val) any = true;
    }
    if (any) rows.push({ tab: name, row: i + 1, v });
  }

  return { tab: { name, headers: cols.map((c) => c.name), rows, lastRow: records.length }, issues };
}
