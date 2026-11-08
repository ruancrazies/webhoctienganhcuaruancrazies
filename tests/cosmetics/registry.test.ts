import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkTheme } from "../../src/cosmetics/checks";
import { ID_RE } from "../../src/cosmetics/core/unlock";
import { AVATARS, FRAMES, THEMES, DEFAULT_THEME_ID, DARK_THEME_ID, resolveThemeId, themeById } from "../../src/cosmetics/registry";
import { REGISTRY_FILE, renderRegistry, scan } from "../../scripts/cosmetics/lib";

describe("registry", () => {
  it("registry.generated.ts khớp thư mục (nếu lỗi: npm run gen:registry)", () => {
    expect(readFileSync(REGISTRY_FILE, "utf8")).toBe(renderRegistry(scan()));
  });

  it("id hợp lệ, không trùng, và khớp tên thư mục", () => {
    const found = scan();
    const lists = { theme: THEMES, avatar: AVATARS, frame: FRAMES } as const;
    for (const { spec, ids } of found) {
      const list = lists[spec.kind];
      expect(list.map((x) => x.id).sort()).toEqual(ids);
      expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
      for (const x of list) expect(x.id).toMatch(ID_RE);
    }
  });

  it("theme dựng sẵn luôn có: paper (mặc định) và dark, đều mở cho mọi người", () => {
    for (const id of [DEFAULT_THEME_ID, DARK_THEME_ID]) expect(themeById(id)?.unlock).toEqual({ type: "default" });
    expect(themeById(DARK_THEME_ID)?.scheme).toBe("dark");
  });

  it("id lạ hoặc ngừng cung cấp → theme mặc định", () => {
    expect(resolveThemeId("khong-co")).toBe(DEFAULT_THEME_ID);
    expect(resolveThemeId(null)).toBe(DEFAULT_THEME_ID);
    expect(resolveThemeId("dark")).toBe("dark");
  });

  it.each(THEMES.map((t) => [t.id, t] as const))("theme %s đạt mọi kiểm tra (token đủ, tương phản 4.5:1 / 3:1)", (_id, t) => {
    const bad = checkTheme(t).filter((c) => !c.ok);
    expect(bad, JSON.stringify(bad)).toEqual([]);
  });
});
