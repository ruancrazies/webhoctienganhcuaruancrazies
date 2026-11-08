import { expect, test } from "@playwright/test";
import { PASS, USER, expectNoA11yViolations, expectNoHorizontalScroll, login } from "./helpers";

test("trang đăng nhập: không lỗi trợ năng, không cuộn ngang, ô nhập ≥ 44px, dán mật khẩu được", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoA11yViolations(page);
  await expectNoHorizontalScroll(page);
  const pw = page.locator("#password");
  const box = await pw.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await expect(pw).toHaveAttribute("type", "password");
  expect(await pw.getAttribute("onpaste")).toBeNull(); // không chặn dán (WCAG 2.2)
  await expect(page).toHaveScreenshot("login-paper.png");
});

test("đăng nhập thành công vào trang Học", async ({ page }) => {
  test.skip(!USER || !PASS, "thiếu E2E_USER/E2E_PASSWORD");
  await login(page, USER!, PASS!);
  await expect(page.getByRole("navigation", { name: "Điều hướng chính" }).first()).toBeVisible();
});
