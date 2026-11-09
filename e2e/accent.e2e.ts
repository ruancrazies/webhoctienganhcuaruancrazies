import { expect, test } from "@playwright/test";
import { PASS, USER, expectNoA11yViolations, login } from "./helpers";

test.skip(!USER || !PASS, "thiếu E2E_USER/E2E_PASSWORD");

test.beforeEach(async ({ page }) => {
  await login(page, USER!, PASS!);
  await page.goto("/profile/settings");
  // bắt đầu từ trạng thái "theo giao diện" để các ca độc lập nhau
  await page.getByRole("group", { name: "Màu nhấn" }).getByRole("button", { name: "Theo giao diện" }).click();
});

const html = (page: import("@playwright/test").Page) => page.locator("html");
const group = (page: import("@playwright/test").Page) => page.getByRole("group", { name: "Màu nhấn" });
const accentVar = (page: import("@playwright/test").Page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());

test("chọn màu: áp ngay, đồng bộ aria-pressed, giữ sau khi tải lại (cookie → server render)", async ({ page }) => {
  const before = await accentVar(page);
  const tim = group(page).getByRole("button", { name: "Tím" });
  await tim.click();
  await expect(tim).toHaveAttribute("aria-pressed", "true");
  await expect(html(page)).toHaveAttribute("data-accent", "tim");
  expect(await accentVar(page)).not.toBe(before);
  await expect(page.getByRole("status").filter({ hasText: "Đã đổi màu nhấn" })).toBeVisible();
  await page.reload();
  await expect(html(page)).toHaveAttribute("data-accent", "tim"); // đã đúng ngay trong HTML server trả về
  await expect(group(page).getByRole("button", { name: "Tím" })).toHaveAttribute("aria-pressed", "true");
});

test("'Theo giao diện' gỡ màu nhấn và trả về màu của theme", async ({ page }) => {
  const base = await accentVar(page);
  await group(page).getByRole("button", { name: "Đỏ son" }).click();
  await expect(html(page)).toHaveAttribute("data-accent", "do");
  await group(page).getByRole("button", { name: "Theo giao diện" }).click();
  await expect(html(page)).not.toHaveAttribute("data-accent", /.+/);
  expect(await accentVar(page)).toBe(base);
});

test("bàn phím: Tab tới nút màu, Enter/Space chọn; mọi nút ≥ 44px", async ({ page }) => {
  const cam = group(page).getByRole("button", { name: "Cam đất" });
  await cam.focus();
  await page.keyboard.press("Enter");
  await expect(cam).toHaveAttribute("aria-pressed", "true");
  const la = group(page).getByRole("button", { name: "Xanh lá" });
  await la.focus();
  await page.keyboard.press("Space");
  await expect(la).toHaveAttribute("aria-pressed", "true");
  await expect(cam).toHaveAttribute("aria-pressed", "false");
  for (const b of await group(page).getByRole("button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

for (const theme of ["paper", "dark"]) {
  test(`mỗi màu nhấn trên theme ${theme}: Cài đặt đạt axe (tương phản thật, không chỉ trên giấy)`, async ({ page }) => {
    await page.context().addCookies([{ name: "eg-theme", value: theme, url: page.url() }]);
    await page.reload();
    for (const name of ["Xanh biển", "Xanh lá", "Cam đất", "Tím", "Hồng sen", "Đỏ son"]) {
      await group(page).getByRole("button", { name }).click();
      await expect(group(page).getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
      await expectNoA11yViolations(page);
    }
  });
}
