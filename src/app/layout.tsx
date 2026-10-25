import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Be_Vietnam_Pro, Lexend } from "next/font/google";
import type { ReactNode } from "react";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const body = Be_Vietnam_Pro({ subsets: ["latin", "latin-ext", "vietnamese"], weight: ["400", "500", "600", "700", "800"], variable: "--font-body", display: "swap" });
const display = Lexend({ subsets: ["latin", "latin-ext", "vietnamese"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = { title: "Web học từ vựng", description: "Học từ vựng tiếng Anh qua trò chơi" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined; // do proxy.ts đặt; script inline phải mang nonce này
  return (
    <html lang="vi" className={`${body.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
