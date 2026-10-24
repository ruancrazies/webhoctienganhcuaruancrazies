import { KEY_RE, POS } from "../../../content/schema/constants";
import type { Issue, TabData } from "./types";

export type KeyPlan = {
  /** tab → (số dòng → key mới) */
  byTab: Map<string, Map<number, string>>;
  issues: Issue[];
  assigned: number;
};

export function slugEn(en: string): string {
  return en.normalize("NFC").trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Điền `key` (dạng en:pos:n) cho các dòng chưa có key, trên MỌI tab từ vựng.
 * n = số lớn nhất đã dùng cho cùng en:pos (ở bất kỳ tab nào) + 1, nên không trùng xuyên tab.
 * Dòng đã có key không bao giờ bị đổi.
 */
export function planKeys(tabs: Map<string, TabData>, wordTabNames: string[]): KeyPlan {
  const issues: Issue[] = [];
  const maxN = new Map<string, number>();
  const present = wordTabNames.filter((n) => tabs.has(n));

  for (const name of present) {
    for (const r of tabs.get(name)!.rows) {
      const key = r.v.key;
      if (key && KEY_RE.test(key)) {
        const i = key.lastIndexOf(":");
        const prefix = key.slice(0, i);
        maxN.set(prefix, Math.max(maxN.get(prefix) ?? 0, Number(key.slice(i + 1))));
      }
    }
  }

  const byTab = new Map<string, Map<number, string>>();
  let assigned = 0;
  for (const name of present) {
    const tab = tabs.get(name)!;
    if (!tab.headers.includes("key")) {
      issues.push({ level: "error", tab: name, row: 1, code: "MISSING_COLUMN", msg: 'Thiếu cột "key"' });
      continue;
    }
    for (const r of tab.rows) {
      if (r.v.key) continue;
      const { en, pos } = r.v;
      if (!en) {
        issues.push({ level: "error", tab: name, row: r.row, code: "GENKEY_SKIP", msg: "Thiếu en nên không sinh được key" });
        continue;
      }
      if (en.includes(":")) {
        issues.push({ level: "error", tab: name, row: r.row, code: "GENKEY_SKIP", msg: `en "${en}" chứa dấu ":"` });
        continue;
      }
      if (!(POS as readonly string[]).includes(pos)) {
        issues.push({ level: "error", tab: name, row: r.row, code: "GENKEY_SKIP", msg: `pos "${pos}" không hợp lệ nên không sinh được key` });
        continue;
      }
      const prefix = `${slugEn(en)}:${pos}`;
      const n = (maxN.get(prefix) ?? 0) + 1;
      maxN.set(prefix, n);
      const map = byTab.get(name) ?? new Map<number, string>();
      map.set(r.row, `${prefix}:${n}`);
      byTab.set(name, map);
      assigned++;
    }
  }
  return { byTab, issues, assigned };
}

/** Cột `key` căn theo từng dòng của tab (dòng 1 = tiêu đề), để dán thẳng vào cột key trên Sheet. */
export function keyColumnLines(tab: TabData, fresh: Map<number, string>): string[] {
  const existing = new Map<number, string>();
  for (const r of tab.rows) if (r.v.key) existing.set(r.row, r.v.key);
  const lines = ["key"];
  for (let row = 2; row <= tab.lastRow; row++) lines.push(fresh.get(row) ?? existing.get(row) ?? "");
  return lines;
}
