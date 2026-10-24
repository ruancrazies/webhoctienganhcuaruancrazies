import type { Issue } from "./types";

const where = (i: Issue) => (i.row ? `${i.tab} dòng ${i.row}` : i.tab);

/** In lỗi/cảnh báo, gom theo mã và giới hạn số dòng in để 200k dòng không làm ngập màn hình. */
export function printIssues(issues: Issue[], opts: { maxErrPerCode?: number; maxWarnPerCode?: number } = {}): void {
  const maxErr = opts.maxErrPerCode ?? 20;
  const maxWarn = opts.maxWarnPerCode ?? 5;

  for (const level of ["error", "warn"] as const) {
    const byCode = new Map<string, Issue[]>();
    for (const i of issues) {
      if (i.level !== level) continue;
      const list = byCode.get(i.code) ?? [];
      list.push(i);
      byCode.set(i.code, list);
    }
    if (byCode.size === 0) continue;
    const cap = level === "error" ? maxErr : maxWarn;
    const icon = level === "error" ? "✖" : "⚠";
    console.log(`\n${level === "error" ? "LỖI (dừng nạp)" : "CẢNH BÁO (không dừng)"}`);
    for (const [code, list] of byCode) {
      console.log(`  ${icon} ${code} — ${list.length} chỗ`);
      for (const i of list.slice(0, cap)) console.log(`      ${where(i)}: ${i.msg}`);
      if (list.length > cap) console.log(`      … và ${list.length - cap} chỗ nữa`);
    }
  }
}
