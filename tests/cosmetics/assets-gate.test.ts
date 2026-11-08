import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkAssets } from "../../src/cosmetics/checks";
import { AVATARS, FRAMES } from "../../src/cosmetics/registry";
import { ROOT } from "../../scripts/cosmetics/lib";

const PUBLIC = path.join(ROOT, "public");
const active = <T extends { active?: boolean }>(l: T[]) => l.filter((x) => x.active !== false);

/** Cổng CI của avatar/khung: mọi món ĐANG BẬT phải có ảnh 96 và 192, đúng WebP vuông, dưới ngân sách KB (món tắt chưa bị chặn). */
describe("ảnh avatar và khung đang bật", () => {
  it.each([
    ...active(AVATARS).map((a) => ["avatars", a.id] as const),
    ...active(FRAMES).map((f) => ["frames", f.id] as const),
  ])("%s/%s đạt kiểm ảnh", (kind, id) => {
    const bad = checkAssets(kind, id, PUBLIC).filter((c) => !c.ok);
    expect(bad, JSON.stringify(bad)).toEqual([]);
  });

  it("khung mẫu (đang tắt) vẫn có ảnh hợp lệ để xem ở /admin/gallery", () => {
    for (const f of FRAMES) expect(checkAssets("frames", f.id, PUBLIC).filter((c) => !c.ok), f.id).toEqual([]);
  });
});
