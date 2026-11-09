import { describe, expect, it } from "vitest";
import { parseAccentCookie } from "../../src/lib/accent";

describe("parseAccentCookie", () => {
  it("nhận mã có trong danh mục", () => expect(parseAccentCookie("hong")).toBe("hong"));
  it("không có / rỗng / mã lạ / cố chèn CSS → null (dùng màu của theme)", () => {
    for (const bad of [undefined, null, "", "khong-co", "x;}body{display:none", "BIEN", "bien "]) expect(parseAccentCookie(bad)).toBeNull();
  });
});
