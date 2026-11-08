import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SCENE_KEY } from "../../src/core/loginScene";
import { SCENE_LOADERS_FILE, SCENE_REGISTRY_FILE, SCENES_DIR, renderDrawLoaders, renderSceneRegistry, scanScenes } from "../../scripts/cosmetics/lib";
import { ENGINE_BUDGET_BYTES, checkScene, engineGzipBytes } from "../../src/features/login-scene/checks";
import { sceneCss } from "../../src/features/login-scene/css";
import { SCENES, defaultScene, isKnownScene, sceneById } from "../../src/features/login-scene/scenes";
import { ID_RE } from "../../src/cosmetics/core/unlock";

describe("registry scene", () => {
  it("các tệp sinh tự động khớp thư mục (nếu lỗi: npm run gen:registry)", () => {
    const found = scanScenes();
    expect(readFileSync(SCENE_REGISTRY_FILE, "utf8")).toBe(renderSceneRegistry(found));
    expect(readFileSync(SCENE_LOADERS_FILE, "utf8")).toBe(renderDrawLoaders(found));
  });

  it("id khớp tên thư mục, hợp lệ, không trùng", () => {
    const ids = scanScenes().map((f) => f.id);
    expect(SCENES.map((s) => s.id).sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(ID_RE);
  });

  it("luôn có scene mặc định, không có canvas, luôn chọn được", () => {
    expect(defaultScene().id).toBe(DEFAULT_SCENE_KEY);
    expect(defaultScene().canvas).toBeUndefined();
    expect(isKnownScene(DEFAULT_SCENE_KEY)).toBe(true);
    expect(isKnownScene("khong-co")).toBe(false);
  });

  it("Giai đoạn 1 có ba scene: mặc định, Halloween, Giáng sinh", () => {
    for (const id of ["default", "halloween", "giang-sinh"]) expect(sceneById(id)).toBeDefined();
  });

  it("scene có canvas thì có draw.ts và ngược lại; scene.css chỉ khi có hình tĩnh", () => {
    for (const f of scanScenes()) {
      expect(!!sceneById(f.id)!.canvas, f.id).toBe(f.hasDraw);
      expect(existsSync(path.join(SCENES_DIR, f.id, "scene.ts"))).toBe(true);
    }
  });
});

describe.each(SCENES.map((s) => [s.id, s] as const))("scene %s đạt mọi kiểm tra", (_id, s) => {
  it("token đủ, tương phản 4.5:1 (chữ) / 3:1 (viền, focus), canvas ↔ draw.ts, ngân sách KB", () => {
    const bad = checkScene(s).filter((c) => !c.ok);
    expect(bad, JSON.stringify(bad)).toEqual([]);
  });

  it("CSS biến giới hạn bởi [data-login-scene] và khai báo đủ biến của thẻ + sân khấu", () => {
    const css = sceneCss(s);
    expect(css.startsWith(`[data-login-scene="${s.id}"]{`)).toBe(true);
    for (const v of ["--surface", "--text", "--accent", "--on-accent", "--control-border", "--danger", "--ls-bg", "--ls-bg2", "--ls-text", "--ls-glow", "--ls-accent"]) expect(css).toContain(`${v}:`);
    expect(css).toContain("color-scheme:light");
  });

  it("scene.css (nếu có) không có màu thô và chỉ chạm vào phạm vi của chính scene", () => {
    const f = path.join(SCENES_DIR, s.id, "scene.css");
    if (!existsSync(f)) return;
    const css = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g) ?? []).toEqual([]);
    const selectors = css.match(/(?:^|\})\s*([^{}@]+)\{/g) ?? [];
    for (const sel of selectors) expect(sel).toContain(`[data-login-scene="${s.id}"]`);
  });
});

describe("ngân sách engine", () => {
  it(`engine ≤ ${ENGINE_BUDGET_BYTES / 1024} KB gzip (tính trên mã nguồn, cận trên an toàn)`, () => {
    expect(engineGzipBytes()).toBeLessThanOrEqual(ENGINE_BUDGET_BYTES);
  });
});

describe("tương phản bắt lỗi thật", () => {
  it("scene có màu chữ yếu bị báo", () => {
    const weak = { ...defaultScene(), tokens: { ...defaultScene().tokens, textSoft: "#b0b8d0" } };
    expect(checkScene(weak).filter((c) => !c.ok).map((c) => c.label)).toContain("tương phản textSoft/surface ≥ 4.5:1");
  });
});
