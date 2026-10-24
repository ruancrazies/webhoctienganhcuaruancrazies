/**
 * Giao diện sáng/tối. Lưu lựa chọn ở localStorage (tùy chọn giao diện, như tắt âm), áp dụng bằng thuộc tính
 * data-theme trên <html>. THEME_INIT_SCRIPT chạy trong <head> TRƯỚC khi vẽ trang để không bị nháy sáng→tối.
 */
export type ThemePref = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const KEY = "eg-theme";
const EVENT = "eg-theme-change";
const QUERY = "(prefers-color-scheme: dark)";

/** Chuỗi script chạy sớm (giữ ngắn, không phụ thuộc gì). Khớp logic resolveTheme bên dưới. */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("${KEY}");var d=p==="dark"||(p!=="light"&&matchMedia("${QUERY}").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`;

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref === "system") return typeof matchMedia !== "undefined" && matchMedia(QUERY).matches ? "dark" : "light";
  return pref;
}

function applyTheme(pref: ThemePref): void {
  document.documentElement.dataset.theme = resolveTheme(pref);
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* bỏ qua: vẫn đổi giao diện cho phiên hiện tại */
  }
  applyTheme(pref);
  window.dispatchEvent(new Event(EVENT));
}

/** Theo dõi: đổi lựa chọn (cùng tab / tab khác) và đổi giao diện hệ thống khi đang ở chế độ "Tự động". */
export function subscribeTheme(cb: () => void): () => void {
  const mq = matchMedia(QUERY);
  const onChange = () => {
    applyTheme(getThemePref());
    cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onChange);
  mq.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onChange);
    mq.removeEventListener("change", onChange);
  };
}
