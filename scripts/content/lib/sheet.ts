import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { SheetConfig } from "../../../content/schema/config";
import type { TabKind } from "../../../content/schema/constants";
import { parseTab } from "./csv";
import { adaptReading } from "./reading";
import type { Issue, TabData } from "./types";

export type TabSource = { name: string; kind: TabKind; gid?: string | number | null };

/** Mọi tab được nạp, theo thứ tự trong sheet.config.json. Tab không có ở đây bị bỏ qua. */
export function tabSources(cfg: SheetConfig): TabSource[] {
  const words = cfg.wordTabs.map((t) => ({ name: t.name, kind: "word" as const, gid: t.gid }));
  const others = (["domains", "topics", "sentences", "grammar", "passages", "passageQuestions", "reading", "readingQuestions"] as const).map((kind) => ({
    name: cfg.otherTabs[kind].name,
    kind,
    gid: cfg.otherTabs[kind].gid,
  }));
  return [...words, ...others];
}

/**
 * Tab có gid → /export?format=csv (giá trị đúng như hiển thị trên Sheet).
 * Tab chỉ có tên → /gviz (Google tự đoán KIỂU từng cột và để TRỐNG ô khác kiểu: cột `answer` lẫn số với TRUE/FALSE
 * sẽ mất đáp án đúng/sai). Vì vậy tab có cột lẫn kiểu (passage_questions, reading_questions) PHẢI điền gid.
 */
export function csvUrl(sheetId: string, src: TabSource): string {
  const base = `https://docs.google.com/spreadsheets/d/${sheetId}`;
  return src.gid != null && src.gid !== ""
    ? `${base}/export?format=csv&gid=${encodeURIComponent(String(src.gid))}`
    : `${base}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(src.name)}`; // headers=1: đúng 1 dòng tiêu đề, không để Google tự đoán rồi gộp dòng
}

async function fetchText(url: string, name: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`Không tải được tab "${name}": ${(lastErr as Error).message}`);
}

export type TabMeta = { tab: string; bytes: number; rows: number; ms: number; endsCleanly: boolean };

export type LoadedContent = {
  tabs: Map<string, TabData>;
  /** Lỗi cấp tab khi đọc (cột trùng, tab trống…). */
  loadIssues: Issue[];
  meta: TabMeta[];
  /** Tab có trong cấu hình nhưng không tìm thấy (chỉ xảy ra với --from-dir). */
  missing: string[];
};

/**
 * Tải nội dung. Có `fromDir` thì đọc `<fromDir>/<tab>.csv`, ngược lại tải CSV từng tab từ Google Sheet
 * (Sheet phải chia sẻ "ai có link: chỉ đọc").
 */
export async function loadContent(cfg: SheetConfig, opts: { fromDir?: string } = {}): Promise<LoadedContent> {
  if (!opts.fromDir && process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON chưa được hỗ trợ ở Bước 0 (mới tải CSV công khai). Bỏ biến này, hoặc dùng --from-dir.",
    );
  }
  if (!opts.fromDir && cfg.sheetId.startsWith("REPLACE")) {
    throw new Error(
      "Chưa đặt sheetId: sửa content/sheet.config.json hoặc đặt CONTENT_SHEET_ID trong .env.local (hoặc dùng --from-dir <thư mục CSV>).",
    );
  }

  const tabs = new Map<string, TabData>();
  const loadIssues: Issue[] = [];
  const meta: TabMeta[] = [];
  const missing: string[] = [];

  for (const src of tabSources(cfg)) {
    const t0 = Date.now();
    let text: string;
    if (opts.fromDir) {
      const file = path.join(opts.fromDir, `${src.name}.csv`);
      if (!existsSync(file)) {
        missing.push(src.name);
        continue;
      }
      text = readFileSync(file, "utf8");
    } else {
      text = await fetchText(csvUrl(cfg.sheetId, src), src.name);
    }
    const { tab, issues } = parseTab(src.name, text);
    tabs.set(src.name, tab);
    loadIssues.push(...issues);
    meta.push({
      tab: src.name,
      bytes: Buffer.byteLength(text),
      rows: Math.max(0, tab.lastRow - 1),
      ms: Date.now() - t0,
      endsCleanly: /\r?\n$/.test(text),
    });
  }
  // Tab `reading` / `reading_questions` (cột riêng) → gộp vào bản ghi passages / passage_questions để validate + sync dùng chung.
  loadIssues.push(...adaptReading(tabs, cfg));
  return { tabs, loadIssues, meta, missing };
}
