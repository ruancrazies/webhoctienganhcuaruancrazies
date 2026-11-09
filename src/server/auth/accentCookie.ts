import "server-only";
import { cookies } from "next/headers";
import { ACCENT_COOKIE, ACCENT_COOKIE_MAX_AGE } from "../../lib/accent";

/** Ghi cookie `eg-accent`; `null` = xóa (về màu của theme). Không phải httpOnly vì chỉ là sở thích giao diện, không phải bí mật. */
export async function writeAccentCookie(accent: string | null): Promise<void> {
  const jar = await cookies();
  if (accent === null) jar.set(ACCENT_COOKIE, "", { path: "/", maxAge: 0, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  else jar.set(ACCENT_COOKIE, accent, { path: "/", maxAge: ACCENT_COOKIE_MAX_AGE, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
}
