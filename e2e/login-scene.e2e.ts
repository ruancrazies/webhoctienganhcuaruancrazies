import { expect, test } from "@playwright/test";
import { expectNoA11yViolations, expectNoHorizontalScroll } from "./helpers";

// `?scene=` chỉ có tác dụng ngoài production (dev/test), nên dùng được để kiểm từng scene mà không cần DB.
// Checklist giai đoạn 4: kiểm ở 375, 768, 1024, 1440px. Ảnh chụp chuẩn chỉ giữ ở 375 và 1024 (hai khổ chính) để bộ ảnh không phình;
// ảnh của scene mới cần tạo lần đầu bằng `--update-snapshots`.
const SIZES = [
  ["375px", { width: 375, height: 760 }, true],
  ["768px", { width: 768, height: 900 }, false],
  ["1024px", { width: 1024, height: 720 }, true],
  ["1440px", { width: 1440, height: 900 }, false],
] as const;
const SCENES = ["default", "halloween", "giang-sinh", "tet", "trung-thu", "khai-giang"];

for (const scene of SCENES) {
  for (const [label, size, shot] of SIZES) {
    test(`đăng nhập · scene ${scene} · ${label}: không cuộn ngang, đạt axe, ô nhập ≥ 44px`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto(`/login?scene=${scene}`);
      await expect(page.getByRole("heading", { level: 1, name: "Đăng nhập" })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectNoA11yViolations(page);
      for (const id of ["identifier", "password"]) expect((await page.locator(`#${id}`).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      if (shot) await expect(page).toHaveScreenshot(`login-${scene}-${label}.png`, { maxDiffPixelRatio: 0.03 });
    });
  }
}

// Ba scene mùa của giai đoạn 4: công cụ có tên đọc được, dùng được bằng bàn phím; giảm chuyển động thì tắt canvas mà chữ vẫn đủ.
for (const [scene, tool, greeting] of [["tet", /Bao lì xì/, "năm mới"], ["trung-thu", /Lồng đèn/, "Trung thu"], ["khai-giang", /Kính lúp/, "năm học mới"]] as const) {
  test(`scene ${scene}: công cụ ${tool} di chuyển bằng mũi tên; giảm chuyển động vẫn còn lời chào`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 1024, height: 720 } });
    await page.goto(`/login?scene=${scene}`);
    const t = page.getByRole("button", { name: tool });
    await t.waitFor();
    await t.focus();
    const before = (await t.boundingBox())!;
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => (await t.boundingBox())!.x).toBeLessThan(before.x - 10);
    await page.close();

    const reduced = await browser.newPage({ viewport: { width: 1024, height: 720 }, reducedMotion: "reduce" });
    await reduced.goto(`/login?scene=${scene}`);
    await reduced.waitForTimeout(1500);
    await expect(reduced.locator(".ls-root[data-live]")).toHaveCount(0);
    await expect(reduced.locator(".ls-greeting")).toContainText(greeting);
    await reduced.close();
  });
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
