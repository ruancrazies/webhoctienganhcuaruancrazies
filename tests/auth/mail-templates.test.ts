import { describe, expect, it } from "vitest";
import { buildMail, CODE_VALID_MINUTES } from "../../src/server/mail-templates";

describe("buildMail", () => {
  it("mail đăng ký chứa mã và thời hạn", () => {
    const m = buildMail("signup", "123456");
    expect(m?.subject).toMatch(/đăng ký/);
    expect(m?.html).toContain("123456");
    expect(m?.html).toContain(`${CODE_VALID_MINUTES} phút`);
  });

  it("mail quên mật khẩu khác nội dung mail đăng ký", () => {
    const a = buildMail("signup", "111111")!;
    const b = buildMail("recovery", "111111")!;
    expect(b.subject).not.toBe(a.subject);
    expect(b.subject).toMatch(/mật khẩu/);
  });

  it("hỗ trợ magiclink, email, reauthentication", () => {
    for (const t of ["magiclink", "email", "reauthentication"]) expect(buildMail(t, "123456")).not.toBeNull();
  });

  it("trả null với loại chưa hỗ trợ, kể cả tên đặc biệt của object", () => {
    for (const t of ["invite", "email_change", "", "__proto__", "constructor", "toString"]) {
      expect(buildMail(t, "123456")).toBeNull();
    }
  });

  it("từ chối mã không phải chuỗi số (chống chèn HTML)", () => {
    for (const bad of ["<script>", "12 34", "123", "1".repeat(11), "12345a", ""]) {
      expect(() => buildMail("signup", bad)).toThrow();
    }
  });

  it("là tài liệu HTML tiếng Việt", () => {
    expect(buildMail("signup", "123456")!.html).toContain('lang="vi"');
  });
});
