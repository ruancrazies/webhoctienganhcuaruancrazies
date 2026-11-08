import { describe, expect, it } from "vitest";
import { isAdminRole, parseRole } from "../../src/core/roles";

describe("roles", () => {
  it("chỉ chuỗi 'admin' mới là admin; mọi giá trị khác về 'user'", () => {
    expect(parseRole("admin")).toBe("admin");
    for (const v of ["user", "ADMIN", "root", "", null, undefined, 1, {}]) expect(parseRole(v)).toBe("user");
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("Admin")).toBe(false);
  });
});
