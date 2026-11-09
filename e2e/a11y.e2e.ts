import { expect, test, type Page } from "@playwright/test";
import { PASS, USER, expectNoA11yViolations, login } from "./helpers";

/** Mọi phần tử nhận focus bằng Tab phải có viền focus nhìn thấy (độ dày ≥ 2px hoặc bóng đổ), không bị `outline: none` mà không có thay thế. */
async function expectVisibleFocusRing(page: Page, steps: number): Promise<void> {
  const bad: string[] = [];
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2;
      const shadow = cs.boxShadow !== "none";
      const sibling = el.matches("input") && el.nextElementSibling ? getComputedStyle(el.nextElementSibling).outlineStyle !== "none" : false; // ô chọn avatar: viền nằm ở phần tử kề
      return { ok: outline || shadow || sibling, name: `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}"` };
    });
    if (info && !info.ok) bad.push(info.name);
  }
  expect(bad).toEqual([]);
}

/** Không còn hoạt ảnh/chuyển động đang chạy khi người dùng bật giảm chuyển động. */
async function expectNoRunningAnimations(page: Page): Promise<void> {
  await page.waitForTimeout(600);
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").map((a) => (a as CSSAnimation).animationName ?? a.constructor.name));
  expect(running).toEqual([]);
}

test("đăng nhập: Tab đi hết các điều khiển và đều có viền focus", async ({ page }) => {
  await page.goto("/login");
  await expectVisibleFocusRing(page, 8);
});

test("đăng nhập (giảm chuyển động): không có hoạt ảnh nào đang chạy ở mọi scene", async ({ browser }) => {
  for (const scene of ["default", "halloween", "giang-sinh", "tet", "trung-thu", "khai-giang"]) {
    const page = await browser.newPage({ viewport: { width: 1024, height: 720 }, reducedMotion: "reduce" });
    await page.goto(`/login?scene=${scene}`);
    await expectNoRunningAnimations(page);
    await page.close();
  }
});

test.describe("sau đăng nhập", () => {
  test.skip(!USER || !PASS, "thiếu E2E_USER/E2E_PASSWORD");
  test.beforeEach(async ({ page }) => {
    await login(page, USER!, PASS!);
  });

  for (const [path, name] of [["/", "Học"], ["/quests", "Nhiệm vụ"], ["/leaderboard", "Xếp hạng"], ["/profile", "Tôi"], ["/profile/settings", "Cài đặt"], ["/profile/collection", "Bộ sưu tập"]] as const) {
    test(`${name} (${path}): focus nhìn thấy khi Tab`, async ({ page }) => {
      await page.goto(path);
      await expectVisibleFocusRing(page, 12);
    });
    test(`${name} (${path}): giảm chuyển động thì không có hoạt ảnh đang chạy`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(path);
      await expectNoRunningAnimations(page);
    });
  }

  for (const [label, size] of [["375px", { width: 375, height: 800 }], ["768px", { width: 768, height: 900 }], ["1024px", { width: 1024, height: 800 }], ["1440px", { width: 1440, height: 900 }]] as const) {
    test(`Cài đặt ${label}: đạt axe, nút bấm ≥ 44px`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/profile/settings");
      await expectNoA11yViolations(page);
      const small: string[] = [];
      for (const b of await page.locator("main button:visible, main a.btn:visible").all()) {
        const box = await b.boundingBox();
        if (box && box.height < 44) small.push(`${(await b.textContent())?.trim().slice(0, 30)} (${Math.round(box.height)}px)`);
      }
      expect(small).toEqual([]);
    });
  }
});
