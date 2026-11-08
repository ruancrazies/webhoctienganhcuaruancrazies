import { expect, test } from "@playwright/test";
import { ADMIN, ADMIN_PASS, PASS, USER, expectNoA11yViolations, login } from "./helpers";

test.describe("luồng chính (cần tài khoản thử)", () => {
  test.skip(!USER || !PASS, "thiếu E2E_USER/E2E_PASSWORD");

  test("học một vòng: vào cấp A1, mở một trò chơi, trả lời được câu đầu", async ({ page }) => {
    await login(page, USER!, PASS!);
    await page.goto("/level/A1");
    await expectNoA11yViolations(page);
    await page.locator("a.game:not(.off)").first().click();
    await expect(page).toHaveURL(/\/play\//);
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("thi lên cấp: trang giới thiệu bài thi hiển thị luật và nút bắt đầu (hoặc lý do bị khóa)", async ({ page }) => {
    await login(page, USER!, PASS!);
    await page.goto("/exam/A1");
    await expect(page.getByRole("main")).toContainText(/thi|kiểm tra/i);
  });

  test("đổi avatar ở hồ sơ rồi thấy trên bảng xếp hạng", async ({ page }) => {
    await login(page, USER!, PASS!);
    await page.goto("/profile");
    await page.getByRole("group", { name: "Chọn avatar" }).locator("label").nth(1).click();
    await page.getByRole("button", { name: "Lưu avatar" }).click();
    await expect(page.getByText("Đã đổi avatar.")).toBeVisible();
  });
});

test.describe("quản trị", () => {
  test("người thường nhận 404 ở /admin/gallery", async ({ page }) => {
    test.skip(!USER || !PASS, "thiếu E2E_USER/E2E_PASSWORD");
    await login(page, USER!, PASS!);
    const res = await page.goto("/admin/gallery");
    expect(res?.status()).toBe(404);
  });

  test("admin xem được gallery, mọi món đạt kiểm tra", async ({ page }) => {
    test.skip(!ADMIN || !ADMIN_PASS, "thiếu E2E_ADMIN_USER/E2E_ADMIN_PASSWORD");
    await login(page, ADMIN!, ADMIN_PASS!);
    await page.goto("/admin/gallery");
    await expect(page.getByRole("heading", { name: "Gallery" })).toBeVisible();
    await expect(page.getByText(/mọi món đều đạt kiểm tra/)).toBeVisible();
    await expectNoA11yViolations(page);
  });
});
