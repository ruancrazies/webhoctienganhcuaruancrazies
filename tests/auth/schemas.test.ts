import { describe, expect, it } from "vitest";
import {
  fieldErrors,
  isEmailIdentifier,
  loginSchema,
  registerSchema,
  resetSchema,
  safeNext,
  verifySchema,
} from "../../src/core/auth";

const base = { username: "linh_01", email: "Linh@Example.com ", password: "secret1", confirm: "secret1" };

describe("registerSchema", () => {
  it("chấp nhận dữ liệu hợp lệ, chuẩn hóa email", () => {
    const r = registerSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("linh@example.com");
  });

  it.each(["ab", "a".repeat(21), "có dấu", "a b", "a-b", "a@b", ""])("từ chối tên đăng nhập %j", (username) => {
    const r = registerSchema.safeParse({ ...base, username });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error)).toHaveProperty("username");
  });

  it("chấp nhận tên đăng nhập 3 và 20 ký tự, có chữ hoa và _", () => {
    expect(registerSchema.safeParse({ ...base, username: "A_b" }).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, username: "a".repeat(20) }).success).toBe(true);
  });

  it("từ chối mật khẩu ngắn hơn 6 ký tự", () => {
    const r = registerSchema.safeParse({ ...base, password: "12345", confirm: "12345" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error)).toHaveProperty("password");
  });

  it("báo lỗi ở ô nhập lại khi hai mật khẩu khác nhau", () => {
    const r = registerSchema.safeParse({ ...base, confirm: "khac-nhau" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).confirm).toMatch(/không khớp/);
  });

  it("từ chối email sai định dạng", () => {
    expect(registerSchema.safeParse({ ...base, email: "khong-phai-email" }).success).toBe(false);
  });

  it("thiếu trường thì có thông báo tiếng Việt", () => {
    const r = registerSchema.safeParse({});
    expect(r.success).toBe(false);
    if (!r.success) {
      const e = fieldErrors(r.error);
      expect(Object.keys(e).sort()).toEqual(["confirm", "email", "password", "username"]);
    }
  });
});

describe("verifySchema / resetSchema", () => {
  it("mã phải đúng 6 chữ số", () => {
    expect(verifySchema.safeParse({ email: "a@b.co", token: "123456" }).success).toBe(true);
    for (const token of ["12345", "1234567", "12345a", "", " 12 345"]) {
      expect(verifySchema.safeParse({ email: "a@b.co", token }).success).toBe(false);
    }
  });

  it("cắt khoảng trắng quanh mã", () => {
    const r = verifySchema.safeParse({ email: "a@b.co", token: " 123456 " });
    expect(r.success && r.data.token).toBe("123456");
  });

  it("reset cần mật khẩu mới hợp lệ và khớp", () => {
    const ok = { email: "a@b.co", token: "123456", password: "matkhau1", confirm: "matkhau1" };
    expect(resetSchema.safeParse(ok).success).toBe(true);
    expect(resetSchema.safeParse({ ...ok, confirm: "x" }).success).toBe(false);
    expect(resetSchema.safeParse({ ...ok, password: "abc", confirm: "abc" }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("chỉ cần có nhập, không áp độ dài tối thiểu", () => {
    expect(loginSchema.safeParse({ identifier: "linh", password: "a" }).success).toBe(true);
    expect(loginSchema.safeParse({ identifier: " ", password: "a" }).success).toBe(false);
    expect(loginSchema.safeParse({ identifier: "linh", password: "" }).success).toBe(false);
  });

  it("phân biệt email và tên đăng nhập bằng dấu @", () => {
    expect(isEmailIdentifier("a@b.co")).toBe(true);
    expect(isEmailIdentifier("linh_01")).toBe(false);
  });
});

describe("safeNext (chống open redirect)", () => {
  it("giữ đường dẫn nội bộ", () => {
    expect(safeNext("/level/B1?x=1")).toBe("/level/B1?x=1");
    expect(safeNext("/")).toBe("/");
  });

  it.each([
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "evil.com",
    "javascript:alert(1)",
    "/ok\nSet-Cookie: x=1",
    undefined,
    42,
  ])("từ chối %j", (raw) => {
    expect(safeNext(raw)).toBe("/");
  });

  it("không quay lại các trang đăng nhập (tránh vòng lặp)", () => {
    expect(safeNext("/login")).toBe("/");
    expect(safeNext("/verify?email=a@b.co")).toBe("/");
  });

  it("dùng giá trị dự phòng được truyền vào", () => {
    expect(safeNext("https://evil.com", "")).toBe("");
  });
});
