import { describe, expect, it } from "vitest";
import { keyColumnLines, planKeys } from "../../scripts/content/lib/genkeys";
import type { TabData } from "../../scripts/content/lib/types";

function tab(name: string, rows: Record<string, string>[]): TabData {
  return {
    name,
    headers: ["key", "en", "pos"],
    lastRow: rows.length + 1,
    rows: rows.map((v, i) => ({ tab: name, row: i + 2, v })),
  };
}

describe("genkeys", () => {
  it("đánh số n xuyên mọi tab và không đổi key đã có", () => {
    const tabs = new Map<string, TabData>([
      ["A1", tab("A1", [
        { key: "bank:n:1", en: "bank", pos: "n" },
        { key: "", en: "Ice Cream", pos: "n" },
        { key: "", en: "bank", pos: "n" }, // khác nghĩa → n=2
      ])],
      ["A2", tab("A2", [
        { key: "", en: "bank", pos: "n" }, // tab khác nhưng vẫn tiếp số → n=3
        { key: "", en: "bank", pos: "v" }, // khác pos → :1
      ])],
    ]);
    const plan = planKeys(tabs, ["A1", "A2"]);
    expect(plan.issues).toEqual([]);
    expect(plan.byTab.get("A1")!.get(3)).toBe("ice-cream:n:1");
    expect(plan.byTab.get("A1")!.get(4)).toBe("bank:n:2");
    expect(plan.byTab.get("A2")!.get(2)).toBe("bank:n:3");
    expect(plan.byTab.get("A2")!.get(3)).toBe("bank:v:1");
    expect(plan.assigned).toBe(4);
  });

  it("bỏ qua dòng thiếu en/pos sai và báo lỗi", () => {
    const tabs = new Map<string, TabData>([
      ["A1", tab("A1", [
        { key: "", en: "", pos: "n" },
        { key: "", en: "run", pos: "verb" },
        { key: "", en: "a:b", pos: "n" },
      ])],
    ]);
    const plan = planKeys(tabs, ["A1"]);
    expect(plan.assigned).toBe(0);
    expect(plan.issues).toHaveLength(3);
  });

  it("cột key căn đúng theo số dòng của tab", () => {
    const t = tab("A1", [{ key: "a:n:1", en: "a", pos: "n" }, { key: "", en: "b", pos: "n" }]);
    expect(keyColumnLines(t, new Map([[3, "b:n:1"]]))).toEqual(["key", "a:n:1", "b:n:1"]);
  });
});
