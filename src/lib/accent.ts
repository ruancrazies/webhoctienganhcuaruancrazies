/**
 * Màu nhấn: cookie `eg-accent` (mã màu) là bản sao của profiles.accent để server render đúng màu ngay lần đầu, không nháy.
 * Không có cookie hoặc mã lạ = dùng màu nhấn của theme. Chỉ nhận mã có trong danh mục (isAccentId), không bao giờ chèn chuỗi người dùng vào CSS.
 */
import { isAccentId } from "../cosmetics/core/accents";

export const ACCENT_COOKIE = "eg-accent";
export const ACCENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseAccentCookie(raw: string | null | undefined): string | null {
  return isAccentId(raw) ? raw : null;
}
