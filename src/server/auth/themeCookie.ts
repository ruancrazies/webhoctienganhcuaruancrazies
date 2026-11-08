import "server-only";
import { cookies } from "next/headers";
import { THEME_AUTO } from "../../core/cosmetics";
import { isKnownTheme } from "../../cosmetics/registry";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE } from "../../lib/theme";
import { getProfile } from "../repo/profiles";

/** Cookie `eg-theme` là bản sao của lựa chọn để server render đúng màu ngay lần đầu; script ở <head> cũng đọc nó nên không đặt httpOnly. */
export async function writeThemeCookie(value: string): Promise<void> {
  (await cookies()).set(THEME_COOKIE, value, { path: "/", maxAge: THEME_COOKIE_MAX_AGE, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
}

export async function readThemeCookie(): Promise<string | undefined> {
  return (await cookies()).get(THEME_COOKIE)?.value;
}

/**
 * Sau khi đăng nhập: đặt cookie theo theme của TÀI KHOẢN (đăng nhập ở thiết bị mới vẫn đúng giao diện ngay trang đầu).
 * Không kiểm sở hữu ở đây (khung (app) sẽ chỉnh nếu món đã hết hạn). Không bao giờ làm hỏng việc đăng nhập.
 */
export async function restoreThemeCookie(userId: string): Promise<void> {
  try {
    const theme = (await getProfile(userId))?.theme;
    if (theme && (theme === THEME_AUTO || isKnownTheme(theme))) await writeThemeCookie(theme);
  } catch (e) {
    console.error("[theme] không khôi phục được theme sau đăng nhập", e);
  }
}
