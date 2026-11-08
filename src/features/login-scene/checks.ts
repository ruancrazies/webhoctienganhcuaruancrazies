import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { SCENE_GREETING_MAX } from "../../core/loginScene";
import type { Check } from "../../cosmetics/checks";
import { HEX_RE } from "../../cosmetics/core/tokens";
import { ID_RE } from "../../cosmetics/core/unlock";
import { SCENE_TOKEN_KEYS } from "./css";
import { checkSceneContrast } from "./contrast";
import type { SceneMeta } from "./scenes/types";

/** Ngân sách (gzip, tính trên MÃ NGUỒN chưa nén nên là cận trên an toàn). */
export const ENGINE_BUDGET_BYTES = 15 * 1024;
export const DRAW_BUDGET_BYTES = 20 * 1024;

const SCENES_DIR = path.join(__dirname, "scenes");
const ENGINE_FILES = [path.join(__dirname, "engine", "index.ts"), path.join(__dirname, "engine", "geometry.ts")];

export const gzipBytes = (files: string[]): number => gzipSync(Buffer.concat(files.map((f) => readFileSync(f)))).length;
export const engineGzipBytes = (): number => gzipBytes(ENGINE_FILES);

/** Cổng kiểm của một scene: dùng chung cho CI (tests/login-scene) và trang /admin/gallery (chỉ chạy ở server/Node). */
export function checkScene(s: SceneMeta): Check[] {
  const out: Check[] = [];
  out.push({ ok: ID_RE.test(s.id), label: "id hợp lệ" });
  out.push({ ok: s.name.trim().length > 0, label: "có tên cho admin", detail: s.name });
  out.push({ ok: s.greeting.trim().length > 0 && s.greeting.length <= SCENE_GREETING_MAX, label: `câu chào 1–${SCENE_GREETING_MAX} ký tự`, detail: `${s.greeting.length} ký tự` });
  out.push({ ok: s.tagline.trim().length > 0, label: "có dòng phụ" });
  const bad = SCENE_TOKEN_KEYS.filter((k) => !HEX_RE.test(s.tokens[k] ?? ""));
  out.push({ ok: bad.length === 0, label: "đủ token, đúng dạng #rrggbb", detail: bad.join(", ") || undefined });
  if (bad.length === 0) {
    for (const r of checkSceneContrast(s.tokens)) out.push({ ok: r.ok, label: `tương phản ${r.fg}/${r.bg} ≥ ${r.min}:1`, detail: `${r.ratio.toFixed(2)}:1 · ${r.why}` });
  }
  const draw = path.join(SCENES_DIR, s.id, "draw.ts");
  const hasDraw = existsSync(draw);
  out.push({ ok: !!s.canvas === hasDraw, label: s.canvas ? "có draw.ts cho phần canvas" : "không khai báo canvas thì không có draw.ts", detail: hasDraw ? "có draw.ts" : "không có draw.ts" });
  if (hasDraw) {
    const n = gzipBytes([draw]);
    out.push({ ok: n <= DRAW_BUDGET_BYTES, label: `draw.ts ≤ ${DRAW_BUDGET_BYTES / 1024} KB gzip`, detail: `${(n / 1024).toFixed(1)} KB` });
  }
  if (s.canvas) {
    out.push({ ok: s.canvas.toolLabel.trim().length > 0 && s.canvas.hint.trim().length > 0, label: "công cụ có tên đọc được và gợi ý" });
  }
  return out;
}
