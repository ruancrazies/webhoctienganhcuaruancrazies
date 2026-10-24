import type { WordRec } from "./types";

export type Stats = {
  total: number;
  /** cefr → domain → số từ */
  byCefrDomain: Record<string, Record<string, number>>;
  /** cefr → pos → số từ */
  byCefrPos: Record<string, Record<string, number>>;
};

export function computeStats(words: WordRec[]): Stats {
  const byCefrDomain: Stats["byCefrDomain"] = {};
  const byCefrPos: Stats["byCefrPos"] = {};
  for (const w of words) {
    (byCefrDomain[w.cefr] ??= {})[w.domain] = (byCefrDomain[w.cefr][w.domain] ?? 0) + 1;
    (byCefrPos[w.cefr] ??= {})[w.pos] = (byCefrPos[w.cefr][w.pos] ?? 0) + 1;
  }
  return { total: words.length, byCefrDomain, byCefrPos };
}

/** Thêm cột "Tổng" cho mỗi hàng để dễ đọc khi in bảng. */
export function withTotals(table: Record<string, Record<string, number>>): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const cefr of Object.keys(table).sort()) {
    const row = table[cefr];
    out[cefr] = { ...row, Tổng: Object.values(row).reduce((a, b) => a + b, 0) };
  }
  return out;
}
