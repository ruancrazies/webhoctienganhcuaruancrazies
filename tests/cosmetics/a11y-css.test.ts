import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../../src/cosmetics/core/contrast";
import type { ThemeTokens } from "../../src/cosmetics/core/tokens";
import { THEMES } from "../../src/cosmetics/registry";

const SRC = path.join(__dirname, "..", "..", "src");
const read = (f: string) => readFileSync(path.join(SRC, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const FILES = ["app/globals.css", "games/shell/games.css"];

/** Tách các luật CSS phẳng (bỏ qua @media/@container lồng nhau: lấy khai báo ở mọi mức, đủ cho phép kiểm này). */
function rules(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  for (let m = re.exec(css); m; m = re.exec(css)) out.push({ selector: m[1]!.trim().replace(/\s+/g, " "), body: m[2]! });
  return out;
}

describe("viền focus nhìn thấy được (WCAG 1.4.11: 3:1)", () => {
  // Biến trong viền focus → token của theme. --ls-accent thuộc Scene (đã có cổng 3:1 riêng ở tests/login-scene).
  const KEY: Record<string, keyof ThemeTokens> = { "--accent": "accent", "--text": "text", "--danger": "danger" };
  const found = FILES.flatMap((f) => rules(read(f)).filter((r) => /:focus/.test(r.selector) && /outline\s*:/.test(r.body)).map((r) => ({ f, ...r })));

  it("có luật focus để kiểm", () => expect(found.length).toBeGreaterThan(3));

  it.each(found.map((r) => [`${r.f} · ${r.selector}`, r] as const))("%s dùng màu đủ tương phản trên mọi theme", (_n, r) => {
    const outline = /outline\s*:\s*([^;]+)/.exec(r.body)![1]!;
    if (/\bnone\b|\b0\b(?!\.)/.test(outline.replace(/\d+px/g, ""))) throw new Error(`xóa viền focus: ${outline}`);
    const v = /var\((--[a-z-]+)\)/.exec(outline)?.[1];
    expect(v, `viền focus phải dùng biến màu: ${outline}`).toBeDefined();
    if (v === "--ls-accent") return;
    const key = KEY[v!];
    expect(key, `${v} chưa có trong danh sách màu focus được phép (--mark và --border quá nhạt trên theme sáng)`).toBeDefined();
    for (const t of THEMES) for (const bg of ["surface", "bg"] as const) {
      expect(contrastRatio(t.tokens[key!], t.tokens[bg]), `${t.id}: ${v} trên ${bg}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("ô bấm tối thiểu 44px (checklist)", () => {
  const all = FILES.flatMap((f) => rules(read(f)));
  /** Giá trị lớn nhất của một thuộc tính kích thước trong các luật có selector chính xác này (luật sau thắng, nên lấy luật cuối). */
  const last = (selector: string, prop: string): number | undefined => {
    let v: number | undefined;
    for (const r of all) {
      if (!r.selector.split(",").map((x) => x.trim()).includes(selector)) continue;
      const m = new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`).exec(r.body);
      if (m) v = Number(m[1]);
    }
    return v;
  };
  it.each([".btn-sm", ".pill", ".pw-toggle", ".nav a", ".back", ".pchat-pick button"])("%s có min-height ≥ 44px", (sel) => {
    expect(last(sel, "min-height") ?? 0).toBeGreaterThanOrEqual(44);
  });
  it.each([".icon-btn", ".pchat-x"])("%s rộng và cao ≥ 44px", (sel) => {
    expect(last(sel, "width") ?? 0).toBeGreaterThanOrEqual(44);
    expect(last(sel, "height") ?? 0).toBeGreaterThanOrEqual(44);
  });
});

describe("không còn emoji làm biểu tượng giao diện", () => {
  // Cho phép: nội dung dữ liệu (emoji chủ đề từ Sheet, avatar emoji cũ chuyển tiếp), lời thoại thú cưng, ghi chú mã, mẫu email.
  const SKIP = [/avatars\.ts$/, /mail-templates\.ts$/, /mail\.ts$/, /pets\.ts$/, /PetChat\.tsx$/, /PetBackground\.tsx$/, /AccountSettings\.tsx$/, /Avatar\.tsx$/, /LevelScopePicker\.tsx$/];
  const walk = (d: string, out: string[] = []): string[] => {
    for (const n of readdirSync(d)) {
      const p = path.join(d, n);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.tsx$/.test(n)) out.push(p);
    }
    return out;
  };
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u2705\u274C\u23F1\u231B\u23F9\u2328\u2696\u26A1\u26A0\u2B50\u270F\uFE0F]/u;
  it("không có emoji trong JSX của giao diện (dùng <Icon/>)", () => {
    const hits = walk(SRC)
      .filter((f) => !SKIP.some((r) => r.test(f)))
      .flatMap((f) => readFileSync(f, "utf8").split("\n").map((l, i) => ({ f, i: i + 1, l })).filter(({ l }) => !l.trim().startsWith("//") && EMOJI.test(l)).map(({ f, i, l }) => `${path.relative(SRC, f)}:${i}: ${l.trim().slice(0, 80)}`));
    expect(hits).toEqual([]);
  });
});
