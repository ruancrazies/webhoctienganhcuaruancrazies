import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.join(__dirname, "..", "..", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(css|tsx?)$/.test(n)) out.push(p);
  }
  return out;
}

// Được phép chứa mã màu thô: định nghĩa theme, emoji-avatar cũ (chuyển tiếp), mẫu email (HTML mail không có CSS biến).
// Giai đoạn 1: scene.ts (token) và draw.ts (màu vẽ canvas) của Scene đăng nhập, cùng engine/geometry.ts (dựng chuỗi rgba cho chùm sáng). scene.css thì KHÔNG được dùng màu thô.
// Giai đoạn 4: cosmetics/core/accents.ts là bảng màu nhấn (dữ liệu, như theme); component chọn màu chỉ nhận màu qua biến CSS --swatch.
const ALLOW = [
  /src[\\/]cosmetics[\\/]themes[\\/]/,
  /src[\\/]cosmetics[\\/]core[\\/]accents\.ts$/,
  /src[\\/]core[\\/]avatars\.ts$/,
  /src[\\/]server[\\/]mail-templates\.ts$/,
  /src[\\/]features[\\/]login-scene[\\/]scenes[\\/][^\\/]+[\\/](?:scene|draw)\.ts$/,
  /src[\\/]features[\\/]login-scene[\\/]engine[\\/]geometry\.ts$/,
];
const files = walk(SRC).filter((f) => !ALLOW.some((r) => r.test(f)));
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("không dùng màu thô / tên token cũ ngoài theme", () => {
  it("không có mã #hex hay rgb()/hsl() trong CSS và component", () => {
    const hits = files.flatMap((f) => (strip(readFileSync(f, "utf8")).match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g) ?? []).map((m) => `${path.relative(SRC, f)}: ${m}`));
    expect(hits).toEqual([]);
  });

  it("không còn biến cũ (--paper, --ink, --sheet, --pencil, --line, --red, --good, --warn)", () => {
    const re = /var\(--(?:paper|grid|sheet|ink[a-z-]*|on-ink|pencil[a-z-]*|line|red[a-z-]*|on-red|good[a-z-]*|warn(?:-soft)?|card|muted|primary[a-z-]*|ok(?:-bg)?)\)/g;
    const hits = files.flatMap((f) => (readFileSync(f, "utf8").match(re) ?? []).map((m) => `${path.relative(SRC, f)}: ${m}`));
    expect(hits).toEqual([]);
  });

  it("chỉ còn một tệp CSS toàn cục cho giao diện (globals.css) cộng CSS trò chơi và hình tĩnh của từng Scene", () => {
    const css = walk(SRC).filter((f) => f.endsWith(".css")).map((f) => path.relative(SRC, f).replace(/\\/g, "/")).sort();
    const scene = /^features\/login-scene\/scenes\/[a-z][a-z0-9-]+\/scene\.css$/;
    expect(css.filter((f) => !scene.test(f))).toEqual(["app/globals.css", "games/shell/games.css"]);
  });
});
