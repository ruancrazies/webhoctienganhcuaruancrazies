import { expect, test } from "@playwright/test";
import { expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

// `?scene=` chỉ có tác dụng ngoài production (dev/test), nên dùng được để kiểm từng scene mà không cần DB.
for (const scene of ["default", "halloween", "giang-sinh"]) {
  for (const [label, size] of [["375px", { width: 375, height: 760 }], ["1024px", { width: 1024, height: 720 }]] as const) {
    test(`đăng nhập · scene ${scene} · ${label}: không cuộn ngang, đạt axe, ô nhập ≥ 44px`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto(`/login?scene=${scene}`);
      await expect(page.getByRole("heading", { level: 1, name: "Đăng nhập" })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectNoA11yViolations(page);
      for (const id of ["identifier", "password"]) expect((await page.locator(`#${id}`).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(page).toHaveScreenshot(`login-${scene}-${label}.png`, { maxDiffPixelRatio: 0.03 });
    });
  }
}

test("nút Hiện đổi type và đồng bộ aria-pressed; mật khẩu vẫn là input thật", async ({ page }) => {
  await page.goto("/login");
  const pw = page.locator("#password");
  const btn = page.getByRole("button", { name: "Hiện mật khẩu" });
  await pw.fill("abc12345");
  await expect(pw).toHaveAttribute("type", "password");
  await btn.click();
  await expect(pw).toHaveAttribute("type", "text");
  await expect(btn).toHaveAttribute("aria-pressed", "true");
  await btn.click();
  await expect(pw).toHaveAttribute("type", "password");
});

test("canvas là phần nâng cao: chạy khi bình thường, tắt khi giảm chuyển động (bản tĩnh vẫn đủ chữ)", async ({ browser }) => {
  const normal = await browser.newPage({ viewport: { width: 1024, height: 720 } });
  await normal.goto("/login?scene=halloween");
  await expect(normal.locator(".ls-root[data-live]")).toBeVisible();
  await expect(normal.getByRole("button", { name: /Đèn pin/ })).toBeVisible();
  await normal.close();

  const reduced = await browser.newPage({ viewport: { width: 1024, height: 720 }, reducedMotion: "reduce" });
  await reduced.goto("/login?scene=halloween");
  await reduced.waitForTimeout(1500);
  await expect(reduced.locator(".ls-root[data-live]")).toHaveCount(0);
  await expect(reduced.locator(".ls-canvas")).toBeHidden();
  await expect(reduced.locator(".ls-greeting")).toContainText("Halloween");
  await reduced.close();
});

test("chiếu đèn vào ô mật khẩu thì hiện mật khẩu, rời đi thì ẩn lại", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 });
  await page.goto("/login?scene=halloween");
  await page.locator("#password").fill("abc12345");
  const tool = page.getByRole("button", { name: /Đèn pin/ });
  await tool.waitFor();
  const aim = async (target: { x: number; y: number }) => {
    const h = (await page.locator(".ls-handle").boundingBox())!;
    await page.mouse.move(h.x + 22, h.y + 22);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.mouse.up();
  };
  const f = (await page.locator('[data-scene-target="password"]').boundingBox())!;
  await aim({ x: f.x + f.width / 2, y: f.y + f.height / 2 });
  await expect(page.locator("#password")).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "Hiện mật khẩu" })).toHaveAttribute("aria-pressed", "true");
  await aim({ x: 100, y: 100 });
  await expect(page.locator("#password")).toHaveAttribute("type", "password");
});

test("bàn phím: mũi tên di chuyển công cụ, Shift+mũi tên xoay", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 });
  await page.goto("/login?scene=giang-sinh");
  const tool = page.getByRole("button", { name: /Ngôi sao/ });
  await tool.waitFor();
  await tool.focus();
  const before = (await tool.boundingBox())!;
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await tool.boundingBox())!.x).toBeLessThan(before.x - 10);
});
