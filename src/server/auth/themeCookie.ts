import "server-only";
import { cookies } from "next/headers";
import { THEME_AUTO } from "../../core/cosmetics";
import { isAccentId } from "../../cosmetics/core/accents";
import { isKnownTheme } from "../../cosmetics/registry";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE } from "../../lib/theme";
import { getProfile } from "../repo/profiles";
import { getAccentId } from "../repo/cosmetics";
import { writeAccentCookie } from "./accentCookie";

/** Cookie `eg-theme` là bản sao của lựa chọn để server render đúng màu ngay lần đầu; script ở <head> cũng đọc nó nên không đặt httpOnly. */
export async function writeThemeCookie(value: string): Promise<void> {
  (await cookies()).set(THEME_COOKIE, value, { path: "/", maxAge: THEME_COOKIE_MAX_AGE, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
}

export async function readThemeCookie(): Promise<string | undefined> {
  return (await cookies()).get(THEME_COOKIE)?.value;
}

/**
 * Sau khi đăng nhập: đặt cookie theo theme và màu nhấn của TÀI KHOẢN (đăng nhập ở thiết bị mới vẫn đúng giao diện ngay trang đầu).
 * Không kiểm sở hữu ở đây (khung (app) sẽ chỉnh nếu món đã hết hạn). Không bao giờ làm hỏng việc đăng nhập.
 */
export async function restoreThemeCookie(userId: string): Promise<void> {
  try {
    const profile = await getProfile(userId);
    const theme = profile?.theme;
    const accent = profile ? await getAccentId(userId) : null; // tách khỏi getProfile: chưa áp migration 0021 thì chỉ mất màu nhấn
    if (theme && (theme === THEME_AUTO || isKnownTheme(theme))) await writeThemeCookie(theme);
    // Màu nhấn theo tài khoản: thiết bị mới nhận đúng màu ngay trang đầu; tài khoản chưa chọn → xóa cookie cũ của người khác dùng chung máy.
    if (profile) await writeAccentCookie(isAccentId(accent) ? accent : null);
  } catch (e) {
    console.error("[theme] không khôi phục được theme sau đăng nhập", e);
  }
}
