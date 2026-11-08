import { expect, test } from "@playwright/test";
import { PASS, USER, expectNoA11yViolations, expectNoHorizontalScroll, login } from "./helpers";

test.skip(!USER || !PASS, "thiếu E2E_USER/E2E_PASSWORD");

test.beforeEach(async ({ page }) => {
  await login(page, USER!, PASS!);
});

const html = (page: import("@playwright/test").Page) => page.locator("html");

test("đổi theme bằng menu nhanh: áp ngay, giữ sau khi tải lại, không nháy (cookie → server render)", async ({ page }) => {
  await page.getByRole("button", { name: "Menu nhanh" }).click();
  await page.getByRole("group", { name: "Menu nhanh" }).getByRole("button", { name: "Tối", exact: true }).click();
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(html(page)).toHaveAttribute("data-theme", "dark"); // đã đúng ngay trong HTML server trả về
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(15, 18, 32)");
});

test("menu nhanh: Esc đóng và trả focus về nút mở", async ({ page }) => {
  const btn = page.getByRole("button", { name: "Menu nhanh" });
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(btn).toHaveAttribute("aria-expanded", "false");
  await expect(btn).toBeFocused();
});

test("công tắt 'Tự động theo thiết bị' theo hệ điều hành; chọn theme khác thì tắt", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/profile");
  await page.getByRole("button", { name: "Đang tắt" }).first().click();
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html(page)).toHaveAttribute("data-theme", "paper");
  await page.getByRole("button", { name: "Vở ô ly", exact: true }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html(page)).toHaveAttribute("data-theme", "paper");
});

for (const theme of ["paper", "dark"]) {
  test(`theme ${theme}: các màn chính đạt axe, không cuộn ngang, ảnh chụp khớp`, async ({ page }) => {
    await page.context().addCookies([{ name: "eg-theme", value: theme, url: page.url() }]);
    for (const [path, name] of [["/", "hoc"], ["/quests", "nhiem-vu"], ["/leaderboard", "xep-hang"], ["/profile", "toi"]] as const) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expectNoA11yViolations(page);
      await expectNoHorizontalScroll(page);
      await expect(page).toHaveScreenshot(`${name}-${theme}.png`, { fullPage: true, mask: [page.locator(".pet-layer")] });
    }
  });
}

test("điều hướng: /insights thuộc tab Học; /results thuộc tab Tôi", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Điều hướng chính" });
  await page.goto("/insights");
  await expect(nav.locator("a[aria-current=page]").filter({ visible: true }).first()).toHaveText(/Học/);
  await page.goto("/results");
  await expect(nav.locator("a[aria-current=page]").filter({ visible: true }).first()).toHaveText(/Tôi/);
});
