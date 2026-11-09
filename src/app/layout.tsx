import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "@fontsource/be-vietnam-pro/800.css";
import "@fontsource/baloo-2/600.css";
import "@fontsource/baloo-2/700.css";
import "@fontsource/baloo-2/800.css";
import { DARK_THEME_ID, DEFAULT_THEME_ID } from "@/cosmetics/core/constants";
import { accentCss } from "@/cosmetics/core/accents";
import { themeCss } from "@/cosmetics/core/css";
import { THEMES, isKnownTheme, themeById } from "@/cosmetics/registry";
import { ACCENT_COOKIE, parseAccentCookie } from "@/lib/accent";
import { THEME_COOKIE, THEME_INIT_SCRIPT, parseThemeCookie } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = { title: "Web học từ vựng", description: "Học từ vựng tiếng Anh qua trò chơi" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined; // do proxy.ts đặt; script inline phải mang nonce này
  const jar = await cookies();
  // Theme đang chọn đọc từ cookie để HTML đúng màu ngay lần đầu (không nháy). Mã lạ → mặc định.
  // Quyền dùng (sở hữu, còn hạn) do server kiểm khi ghi cookie và khi đồng bộ ở khung (app); đây chỉ là bản sao để vẽ nhanh.
  const pref = parseThemeCookie(jar.get(THEME_COOKIE)?.value, isKnownTheme);
  // Mỗi trang chỉ in CSS của theme đang dùng, cộng hai theme luôn mở (mặc định + tối) để chế độ "Tự động" chuyển được tức thì.
  const ids = [...new Set([pref.theme, DEFAULT_THEME_ID, DARK_THEME_ID])];
  // Màu nhấn (nếu có) đè lên màu nhấn của theme; chỉ in CSS của đúng màu đang chọn, và chỉ nhận mã có trong danh mục.
  const accent = parseAccentCookie(jar.get(ACCENT_COOKIE)?.value);
  return (
    <html lang="vi" data-theme={pref.theme} data-accent={accent ?? undefined} suppressHydrationWarning>
      <head>
        {ids.map((id) => (
          <style key={id} data-theme-css={id} dangerouslySetInnerHTML={{ __html: themeCss(themeById(id)!) }} />
        ))}
        {accent && <style data-accent-css={accent} dangerouslySetInnerHTML={{ __html: accentCss(accent, THEMES) }} />}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
