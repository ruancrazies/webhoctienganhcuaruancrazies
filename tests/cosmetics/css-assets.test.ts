import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkAssets, webpSize } from "../../src/cosmetics/checks";
import { contrastRatio } from "../../src/cosmetics/core/contrast";
import { themeCss } from "../../src/cosmetics/core/css";
import { TOKEN_KEYS, TOKEN_VARS } from "../../src/cosmetics/core/tokens";
import { THEMES } from "../../src/cosmetics/registry";

describe("themeCss", () => {
  it("khai báo mọi token, color-scheme và họa tiết, giới hạn bởi [data-theme]", () => {
    for (const t of THEMES) {
      const css = themeCss(t);
      expect(css.startsWith(`[data-theme="${t.id}"]{`)).toBe(true);
      for (const k of TOKEN_KEYS) expect(css).toContain(`${TOKEN_VARS[k]}:${t.tokens[k]}`);
      expect(css).toContain(`color-scheme:${t.scheme}`);
      expect(css).toContain("--pattern-image:");
    }
  });
});

describe("contrastRatio", () => {
  it("đen/trắng = 21, cùng màu = 1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#123456", "#123456")).toBeCloseTo(1, 5);
  });
});

/** Tiêu đề WebP tối thiểu dạng VP8X (đủ để đọc kích thước). */
function webp(size: number, pad = 0): Buffer {
  const b = Buffer.alloc(30 + pad);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WEBP", 8, "ascii");
  b.write("VP8X", 12, "ascii");
  b.writeUIntLE(size - 1, 24, 3);
  b.writeUIntLE(size - 1, 27, 3);
  return b;
}

describe("webpSize / checkAssets", () => {
  it("đọc kích thước VP8X và từ chối tệp không phải WebP", () => {
    expect(webpSize(webp(96))).toEqual({ w: 96, h: 96 });
    expect(webpSize(Buffer.from("không phải ảnh, dài hơn ba mươi byte đủ rồi"))).toBeNull();
  });

  it("đạt khi đủ 96 và 192 đúng cỡ; báo lỗi khi thiếu, sai cỡ hoặc quá ngân sách", () => {
    const pub = mkdtempSync(path.join(tmpdir(), "pub-"));
    const dir = path.join(pub, "avatars", "x");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "96.webp"), webp(96));
    writeFileSync(path.join(dir, "192.webp"), webp(192));
    expect(checkAssets("avatars", "x", pub).every((c) => c.ok)).toBe(true);

    writeFileSync(path.join(dir, "192.webp"), webp(100, 16 * 1024));
    const bad = checkAssets("avatars", "x", pub).filter((c) => !c.ok).map((c) => c.label);
    expect(bad).toHaveLength(2);

    expect(checkAssets("avatars", "khong-co", pub).some((c) => !c.ok)).toBe(true);
  });
});
