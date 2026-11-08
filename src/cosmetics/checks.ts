import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { checkContrast } from "./core/contrast";
import type { ThemeDef } from "./core/define";
import { HEX_RE, TOKEN_KEYS } from "./core/tokens";
import { ID_RE } from "./core/unlock";
import { ASSET_BUDGET_BYTES, ASSET_SIZES, assetUrl, type AssetKind } from "./assets";

/** Cổng kiểm dùng chung cho CI (tests/cosmetics) và trang /admin/gallery: chỉ chạy ở server/Node, không nạp vào client. */
export type Check = { ok: boolean; label: string; detail?: string };

export function checkTheme(t: ThemeDef): Check[] {
  const out: Check[] = [];
  out.push({ ok: ID_RE.test(t.id), label: "id hợp lệ" });
  out.push({ ok: t.name.trim().length > 0 && t.name !== t.id, label: "có tên hiển thị", detail: t.name });
  const bad = TOKEN_KEYS.filter((k) => !HEX_RE.test(t.tokens[k] ?? ""));
  out.push({ ok: bad.length === 0, label: "đủ token, đúng dạng #rrggbb", detail: bad.join(", ") || undefined });
  if (bad.length === 0) {
    for (const r of checkContrast(t.tokens)) {
      out.push({ ok: r.ok, label: `tương phản ${r.fg}/${r.bg} ≥ ${r.min}:1`, detail: `${r.ratio.toFixed(2)}:1 · ${r.why}` });
    }
  }
  return out;
}

/** Kích thước (px) của ảnh WebP từ phần đầu tệp; null nếu không phải WebP hợp lệ. */
export function webpSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const kind = buf.toString("ascii", 12, 16);
  if (kind === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  if (kind === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L") {
    const b = buf.readUInt32LE(21);
    return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/** Ảnh avatar/khung phải có đủ hai kích cỡ, đúng WebP, vuông đúng cỡ, dưới ngân sách KB. */
export function checkAssets(kind: AssetKind, id: string, publicDir: string): Check[] {
  const out: Check[] = [];
  for (const size of ASSET_SIZES) {
    const file = path.join(publicDir, assetUrl(kind, id, size));
    const name = `${size}.webp`;
    if (!existsSync(file)) {
      out.push({ ok: false, label: `có ${name}`, detail: "thiếu tệp" });
      continue;
    }
    const buf = readFileSync(file);
    const kb = statSync(file).size / 1024;
    out.push({ ok: statSync(file).size <= ASSET_BUDGET_BYTES, label: `${name} dưới ${ASSET_BUDGET_BYTES / 1024} KB`, detail: `${kb.toFixed(1)} KB` });
    const dim = webpSize(buf);
    out.push({ ok: !!dim && dim.w === size && dim.h === size, label: `${name} là WebP vuông ${size}px`, detail: dim ? `${dim.w}×${dim.h}` : "không phải WebP" });
  }
  return out;
}
