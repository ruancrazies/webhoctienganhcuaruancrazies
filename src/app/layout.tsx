import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "@fontsource/be-vietnam-pro/800.css";
import { DARK_THEME_ID, DEFAULT_THEME_ID } from "@/cosmetics/core/constants";
import { themeCss } from "@/cosmetics/core/css";
import { resolveThemeId, themeById } from "@/cosmetics/registry";
import { THEME_COOKIE, THEME_INIT_SCRIPT, parseThemeCookie } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = { title: "Web học từ vựng", description: "Học từ vựng tiếng Anh qua trò chơi" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined; // do proxy.ts đặt; script inline phải mang nonce này
  const jar = await cookies();
  // Theme đang chọn đọc từ cookie để HTML đúng màu ngay lần đầu (không nháy). Mã lạ/ngừng cung cấp → mặc định.
  const pref = parseThemeCookie(jar.get(THEME_COOKIE)?.value, (id) => resolveThemeId(id) === id);
  // Mỗi trang chỉ in CSS của theme đang dùng, cộng hai theme luôn mở (mặc định + tối) để chế độ "Tự động" chuyển được tức thì.
  const ids = [...new Set([pref.theme, DEFAULT_THEME_ID, DARK_THEME_ID])];
  return (
    <html lang="vi" data-theme={pref.theme} suppressHydrationWarning>
      <head>
        {ids.map((id) => (
          <style key={id} data-theme-css={id} dangerouslySetInnerHTML={{ __html: themeCss(themeById(id)!) }} />
        ))}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
