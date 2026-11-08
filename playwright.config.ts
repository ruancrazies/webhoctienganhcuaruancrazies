import { defineConfig, devices } from "@playwright/test";

/**
 * Test giao diện (npm run test:e2e). Cần một môi trường chạy thật: Supabase local/staging + tài khoản thử.
 *   E2E_BASE_URL   mặc định http://localhost:3000 (nếu không đặt thì tự chạy `npm run dev`)
 *   E2E_USER / E2E_PASSWORD   tài khoản thử đã xác nhận mail (thiếu thì các test cần đăng nhập tự bỏ qua)
 *   E2E_ADMIN_USER / E2E_ADMIN_PASSWORD   tài khoản có profiles.role = 'admin' (cho gallery)
 * Dùng khóa Turnstile thử luôn-pass: NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA, TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA.
 * Ảnh chụp so sánh: lần đầu chạy `npm run test:e2e -- --update-snapshots` rồi commit e2e/**-snapshots.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  projects: [
    { name: "mobile-375", use: { ...devices["Pixel 5"], viewport: { width: 375, height: 800 } } },
    { name: "desktop-1024", use: { viewport: { width: 1024, height: 800 } } },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
