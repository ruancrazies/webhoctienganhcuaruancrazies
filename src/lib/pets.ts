/**
 * Tùy chọn bật/tắt thú cưng nền (chỉ là tùy chọn giao diện, như tắt âm/giao diện tối: lưu ở localStorage).
 * Mặc định BẬT, trừ khi thiết bị đặt "giảm chuyển động" (prefers-reduced-motion).
 */
const KEY = "eg-pets";
const EVENT = "eg-pets-change";

export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function isPetsOn(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    /* bỏ qua */
  }
  return !prefersReducedMotion();
}

export function setPetsOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* bỏ qua */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

export function subscribePets(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
