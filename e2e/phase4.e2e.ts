import { expect, test } from "@playwright/test";
import { PASS, USER, expectNoA11yViolations, expectNoHorizontalScroll, login } from "./helpers";

test.describe("giai đoạn 4 · đăng nhập (không cần tài khoản)", () => {
  test("không có chuyển động trang trí khi bật giảm chuyển động (mọi scene có canvas)", async ({ browser }) => {
    for (const scene of ["halloween", "giang-sinh", "tet", "trung-thu", "khai-giang"]) {
      const page = await browser.newPage({ viewport: { width: 1024, height: 720 }, reducedMotion: "reduce" });
      await page.goto(`/login?scene=${scene}`);
      await page.waitForTimeout(1200);
      await expect(page.locator(".ls-root[data-live]"), scene).toHaveCount(0);
      // mọi hoạt ảnh/chuyển tiếp CSS đều ~0ms
      const slow = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("*")].filter((e) => {
          const cs = getComputedStyle(e);
          const ms = (v: string) => Math.max(...v.split(",").map((x) => (x.trim().endsWith("ms") ? parseFloat(x) : parseFloat(x) * 1000)));
          return ms(cs.animationDuration) > 1 || ms(cs.transitionDuration) > 1;
        }).length,
      );
      expect(slow, scene).toBe(0);
      await page.close();
    }
  });

  test("bàn phím: Tab đi hết form theo thứ tự hợp lý, focus luôn nhìn thấy", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 720 });
    await page.goto("/login?scene=tet");
    await page.locator("#identifier").focus();
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      const info = await page.evaluate(() => {
        const e = document.activeElement as HTMLElement | null;
        if (!e) return null;
        const cs = getComputedStyle(e);
        const visible = (parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== "none") || cs.boxShadow !== "none";
        return { label: e.getAttribute("aria-label") || e.id || e.textContent?.trim().slice(0, 20) || e.tagName, visible };
      });
      if (info) {
        seen.push(info.label);
        expect(info.visible, `focus không nhìn thấy ở "${info.label}"`).toBe(true);
      }
      await page.keyboard.press("Tab");
    }
    expect(seen.join("|")).toMatch(/identifier.*password.*Hiện/);
  });
});

test.describe("giai đoạn 4 · màu nhấn", () => {
  test.skip(!USER || !PASS, "thiếu E2E_USER/E2E_PASSWORD");

  test("chọn màu: áp ngay, giữ sau khi tải lại, bằng bàn phím được, đạt axe ở sáng và tối", async ({ page }) => {
    await login(page, USER!, PASS!);
    await page.goto("/profile/settings");
    const group = page.getByRole("group", { name: "Màu nhấn" });
    await expect(group.getByRole("radio")).toHaveCount(7); // Theo giao diện + 6 màu
    await group.getByRole("radio", { name: "Hồng sen" }).check();
    await expect(page.locator(".app")).toHaveAttribute("data-accent", "rose");
    await page.reload();
    await expect(page.locator(".app")).toHaveAttribute("data-accent", "rose");
    await expect(group.getByRole("radio", { name: "Hồng sen" })).toBeChecked();

    for (const theme of ["paper", "dark"]) {
      await page.context().addCookies([{ name: "eg-theme", value: theme, url: page.url() }]);
      await page.reload();
      await expectNoA11yViolations(page);
      await expectNoHorizontalScroll(page);
    }

    // bàn phím: mũi tên đổi lựa chọn trong nhóm
    await group.getByRole("radio", { name: "Hồng sen" }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(".app")).not.toHaveAttribute("data-accent", "rose");

    await group.getByRole("radio", { name: "Theo giao diện" }).check(); // trả về mặc định
    await expect(page.locator(".app")).not.toHaveAttribute("data-accent", /.+/);
  });

  test("ô bấm trên các màn chính đều ≥ 44px (trừ liên kết trong dòng chữ)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await login(page, USER!, PASS!);
    for (const path of ["/", "/quests", "/leaderboard", "/profile", "/profile/settings", "/profile/collection"]) {
      await page.goto(path);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("button, select, a.btn, a.pill, .btn, .pill")]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            const cs = getComputedStyle(e);
            return r.width > 0 && cs.visibility !== "hidden" && !e.closest("[hidden]") && r.height < 43.5;
          })
          .map((e) => `${e.tagName}.${e.className} "${(e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 24)}" ${Math.round(e.getBoundingClientRect().height)}px`),
      );
      expect(small, path).toEqual([]);
    }
  });
});
