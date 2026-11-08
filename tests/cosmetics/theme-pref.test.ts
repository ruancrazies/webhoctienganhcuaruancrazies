import { describe, expect, it } from "vitest";
import { AUTO, THEME_INIT_SCRIPT, autoTheme, legacyToTheme, parseThemeCookie } from "../../src/lib/theme";

const known = (id: string) => ["paper", "dark", "forest"].includes(id);

describe("parseThemeCookie", () => {
  it("mã theme hợp lệ → dùng; 'auto' → bật tự động", () => {
    expect(parseThemeCookie("dark", known)).toEqual({ theme: "dark", auto: false });
    expect(parseThemeCookie(AUTO, known)).toEqual({ theme: "paper", auto: true });
  });
  it("thiếu, rỗng hoặc mã lạ → paper (không tự động)", () => {
    for (const v of [undefined, null, "", "xoa-roi", "<script>"]) expect(parseThemeCookie(v, known)).toEqual({ theme: "paper", auto: false });
  });
});

describe("chuyển giá trị cũ", () => {
  it("dark → dark; light/system/khác → paper", () => {
    expect(legacyToTheme("dark")).toBe("dark");
    for (const v of ["light", "system", "", null, undefined]) expect(legacyToTheme(v)).toBe("paper");
  });
  it("tự động theo hệ điều hành", () => {
    expect(autoTheme(true)).toBe("dark");
    expect(autoTheme(false)).toBe("paper");
  });
});

describe("THEME_INIT_SCRIPT", () => {
  it("là cú pháp JS hợp lệ, ngắn, và chỉ áp theme đã có CSS", () => {
    expect(() => new Function(THEME_INIT_SCRIPT)).not.toThrow();
    expect(THEME_INIT_SCRIPT.length).toBeLessThan(900);
    expect(THEME_INIT_SCRIPT).toContain("style[data-theme-css=");
  });
});
