/**
 * Giao diện một trục: <html data-theme="paper|dark|…"> là mã theme (xem src/cosmetics). "Tự động theo thiết bị"
 * là một công tắt riêng: bật thì dùng dark khi hệ điều hành ở chế độ tối, còn lại dùng paper; chọn một theme thì tắt.
 *
 * Lưu bằng cookie `eg-theme` (giá trị = mã theme hoặc "auto") để server render đúng ngay lần đầu, không nháy màu.
 * Giai đoạn 2 sẽ thêm lưu theo tài khoản (profiles.theme); cookie vẫn là bản sao để render nhanh.
 * Khóa localStorage cũ "eg-theme" (dark/light/system) được đổi một lần: dark → dark; light/system → paper.
 */
import { DARK_THEME_ID, DEFAULT_THEME_ID } from "../cosmetics/core/constants";

export const THEME_COOKIE = "eg-theme";
export const AUTO = "auto";
const RECENT_KEY = "eg-theme-recent";
const EVENT = "eg-theme-change";
const QUERY = "(prefers-color-scheme: dark)";
const MAX_AGE = 60 * 60 * 24 * 365;

export type ThemePref = { theme: string; auto: boolean };

/** Giá trị cookie → lựa chọn. `isKnown` kiểm mã theme có thật (server truyền vào hàm của registry). */
export function parseThemeCookie(raw: string | null | undefined, isKnown: (id: string) => boolean): ThemePref {
  if (raw === AUTO) return { theme: DEFAULT_THEME_ID, auto: true };
  if (raw && isKnown(raw)) return { theme: raw, auto: false };
  return { theme: DEFAULT_THEME_ID, auto: false };
}

/** Giá trị localStorage cũ → mã theme mới. */
export function legacyToTheme(v: string | null | undefined): string {
  return v === "dark" ? DARK_THEME_ID : DEFAULT_THEME_ID;
}

export const autoTheme = (prefersDark: boolean): string => (prefersDark ? DARK_THEME_ID : DEFAULT_THEME_ID);

/**
 * Chạy trong <head> TRƯỚC khi vẽ trang (đi kèm nonce). Giữ ngắn, không phụ thuộc gì. Việc của nó:
 *  1) đổi khóa localStorage cũ sang cookie (một lần);  2) áp "auto" theo hệ điều hành;
 *  3) chỉ áp mã theme mà CSS của nó đã có trong trang (style[data-theme-css]).
 */
export const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement,k="${THEME_COOKIE}",m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/),v=m?decodeURIComponent(m[1]):null;if(v===null){var l=localStorage.getItem(k);if(l!==null){v=l==="dark"?"${DARK_THEME_ID}":"${DEFAULT_THEME_ID}";document.cookie=k+"="+v+";path=/;max-age=${MAX_AGE};samesite=lax"+(location.protocol==="https:"?";secure":"");localStorage.removeItem(k)}}if(v==="${AUTO}")v=matchMedia("${QUERY}").matches?"${DARK_THEME_ID}":"${DEFAULT_THEME_ID}";if(v&&d.dataset.theme!==v&&document.querySelector('style[data-theme-css="'+v+'"]'))d.dataset.theme=v}catch(e){}})()`;

// ---------------- phía trình duyệt ----------------

function readCookie(): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

function writeCookie(v: string): void {
  document.cookie = `${THEME_COOKIE}=${encodeURIComponent(v)};path=/;max-age=${MAX_AGE};samesite=lax${location.protocol === "https:" ? ";secure" : ""}`;
}

const hasCss = (id: string): boolean => !!document.querySelector(`style[data-theme-css="${CSS.escape(id)}"]`);

/** Mã theme đang áp lên trang (kết quả cuối, kể cả khi đang ở chế độ tự động). */
export function getThemeId(): string {
  return document.documentElement.dataset.theme || DEFAULT_THEME_ID;
}

export function getAuto(): boolean {
  return readCookie() === AUTO;
}

function emit(): void {
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Chọn một theme (tắt chế độ tự động). Trả về false nếu CSS của theme chưa có trong trang: khi đó cookie đã ghi,
 * người gọi nên gọi router.refresh() để server render lại với CSS của theme mới.
 */
export function setTheme(id: string): boolean {
  writeCookie(id);
  pushRecent(id);
  const ready = hasCss(id);
  if (ready) document.documentElement.dataset.theme = id;
  emit();
  return ready;
}

export function setAuto(on: boolean): void {
  if (on) {
    writeCookie(AUTO);
    document.documentElement.dataset.theme = autoTheme(matchMedia(QUERY).matches);
  } else {
    writeCookie(getThemeId()); // giữ nguyên theme đang hiện
  }
  emit();
}

function pushRecent(id: string): void {
  try {
    const list = [id, ...getRecent().filter((x) => x !== id)].slice(0, 3);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* bỏ qua: chỉ là gợi ý thứ tự trong menu nhanh */
  }
}

/** Tối đa 3 theme chọn gần nhất (dùng cho menu nhanh). */
export function getRecent(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 3) : [];
  } catch {
    return [];
  }
}
export const getRecentSnapshot = (): string => getRecent().join(",");

/** Theo dõi: đổi lựa chọn và (khi đang tự động) đổi giao diện hệ thống. */
export function subscribeTheme(cb: () => void): () => void {
  const mq = matchMedia(QUERY);
  const onSystem = () => {
    if (getAuto()) document.documentElement.dataset.theme = autoTheme(mq.matches);
    cb();
  };
  window.addEventListener(EVENT, cb);
  mq.addEventListener("change", onSystem);
  return () => {
    window.removeEventListener(EVENT, cb);
    mq.removeEventListener("change", onSystem);
  };
}
