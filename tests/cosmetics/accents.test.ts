import { describe, expect, it } from "vitest";
import { ACCENTS, ACCENT_IDS, accentCss, accentSwatchCss, isAccentId, withAccent } from "../../src/cosmetics/core/accents";
import { checkContrast } from "../../src/cosmetics/core/contrast";
import { HEX_RE } from "../../src/cosmetics/core/tokens";
import { ID_RE } from "../../src/cosmetics/core/unlock";
import { THEMES } from "../../src/cosmetics/registry";

describe("màu nhấn: danh mục", () => {
  it("id hợp lệ, duy nhất, có tên; chỉ nhận #rrggbb", () => {
    expect(new Set(ACCENT_IDS).size).toBe(ACCENTS.length);
    for (const a of ACCENTS) {
      expect(a.id).toMatch(ID_RE);
      expect(a.name.trim().length).toBeGreaterThan(0);
      for (const scheme of [a.light, a.dark]) for (const v of Object.values(scheme)) expect(v, `${a.id}`).toMatch(HEX_RE);
    }
  });
  it("sáu màu như kế hoạch", () => expect(ACCENTS).toHaveLength(6));
  it("isAccentId chỉ nhận mã có thật", () => {
    expect(isAccentId("bien")).toBe(true);
    expect(isAccentId("khong-co")).toBe(false);
    expect(isAccentId(null)).toBe(false);
    expect(isAccentId("<script>")).toBe(false);
  });
});

// Cổng chính: MỖI màu nhấn trên MỌI theme phải đạt đủ bộ luật tương phản của theme (chữ 4.5:1, viền/điều khiển 3:1).
describe.each(ACCENTS.map((a) => [a.id, a] as const))("màu nhấn %s", (_id, a) => {
  it.each(THEMES.map((t) => [t.id, t] as const))("đạt tương phản trên theme %s", (_tid, t) => {
    const merged = withAccent(t.tokens, t.scheme, a.id);
    const bad = checkContrast(merged).filter((r) => !r.ok).map((r) => `${r.fg}/${r.bg} ${r.ratio.toFixed(2)}:1 (cần ${r.min}) · ${r.why}`);
    expect(bad).toEqual([]);
  });
});

describe("cổng bắt lỗi thật", () => {
  it("một màu nhấn quá nhạt trên theme sáng bị báo", () => {
    const paper = THEMES.find((t) => t.id === "paper")!;
    const weak = { ...paper.tokens, accent: "#aab4ff", controlBorder: "#aab4ff" };
    expect(checkContrast(weak).filter((r) => !r.ok).length).toBeGreaterThan(0);
  });
  it("màu bộ dark đặt lên theme sáng bị báo (không dùng nhầm bộ)", () => {
    const paper = THEMES.find((t) => t.id === "paper")!;
    const wrong = withAccent(paper.tokens, "dark", "bien");
    expect(checkContrast(wrong).filter((r) => !r.ok).length).toBeGreaterThan(0);
  });
});

describe("withAccent / accentCss", () => {
  const paper = THEMES.find((t) => t.id === "paper")!;
  it("không chọn (null/mã lạ) thì giữ nguyên token của theme", () => {
    expect(withAccent(paper.tokens, "light", null)).toBe(paper.tokens);
    expect(withAccent(paper.tokens, "light", "khong-co")).toBe(paper.tokens);
  });
  it("đè đúng 4 token nhấn và viền điều khiển, giữ nguyên phần còn lại", () => {
    const m = withAccent(paper.tokens, "light", "bien");
    expect(m.accent).toBe(ACCENTS[0]!.light.accent);
    expect(m.controlBorder).toBe(m.accent);
    expect(m.text).toBe(paper.tokens.text);
    expect(m.surface).toBe(paper.tokens.surface);
  });
  it("CSS: phạm vi html[data-accent], tách theme sáng và tối, có đủ biến", () => {
    const css = accentCss("bien", THEMES);
    expect(css).toContain('html[data-accent="bien"]:is(');
    expect(css.match(/html\[data-accent="bien"\]/g)).toHaveLength(2);
    for (const v of ["--accent:", "--accent-soft:", "--on-accent:", "--accent-edge:", "--control-border:"]) expect(css).toContain(v);
    for (const t of THEMES) expect(css).toContain(`[data-theme="${t.id}"]`);
    expect(accentCss("khong-co", THEMES)).toBe("");
  });
  it("CSS ô màu mẫu có đủ mọi màu", () => {
    const css = accentSwatchCss(THEMES);
    for (const a of ACCENTS) expect(css).toContain(`[data-accent-swatch="${a.id}"]`);
  });
});
