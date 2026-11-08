import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkTheme } from "../../src/cosmetics/checks";
import { ID_RE } from "../../src/cosmetics/core/unlock";
import { MAX_XP_LEVEL } from "../../src/core/xpLevel";
import { AVATARS, FRAMES, THEMES, DEFAULT_THEME_ID, DARK_THEME_ID, manifestEntries, resolveThemeId, themeById } from "../../src/cosmetics/registry";
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

  it("id duy nhất trên MỌI loại (bảng cosmetics dùng id làm khóa; cookie và user_cosmetics tham chiếu id)", () => {
    const ids = manifestEntries().map((m) => m.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    expect(ids).not.toContain("auto"); // "auto" là giá trị đặc biệt của profiles.theme
  });

  it("món mở theo level phải đạt được (1..MAX_XP_LEVEL); món sự kiện có mã sự kiện", () => {
    for (const m of manifestEntries()) {
      if (m.unlock.type === "level") {
        expect(m.unlock.level, m.id).toBeGreaterThanOrEqual(1);
        expect(m.unlock.level, m.id).toBeLessThanOrEqual(MAX_XP_LEVEL);
      }
      if (m.unlock.type === "event") expect(m.unlock.event.length, m.id).toBeGreaterThan(0);
    }
  });

  it("chỉ khung mới có độ hiếm; avatar/khung có thời hạn nếu khai báo thì là số ngày dương", () => {
    for (const m of manifestEntries()) {
      expect(m.rarity !== null, m.id).toBe(m.kind === "frame");
      if (m.durationDays !== null) expect(m.durationDays, m.id).toBeGreaterThan(0);
    }
  });
});
