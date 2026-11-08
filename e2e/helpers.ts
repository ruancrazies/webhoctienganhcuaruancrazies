import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const USER = process.env.E2E_USER;
export const PASS = process.env.E2E_PASSWORD;
export const ADMIN = process.env.E2E_ADMIN_USER;
export const ADMIN_PASS = process.env.E2E_ADMIN_PASSWORD;

export async function login(page: Page, user: string, pass: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/tên đăng nhập|email/i).fill(user);
  await page.getByLabel(/mật khẩu/i).fill(pass);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await page.waitForURL((u) => u.pathname === "/");
}

/** Không có vi phạm axe mức serious/critical (WCAG 2.x A/AA). */
export async function expectNoA11yViolations(page: Page): Promise<void> {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.length} nút`)).toEqual([]);
}

/** Không cuộn ngang (kiểm ở 375px). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
}
