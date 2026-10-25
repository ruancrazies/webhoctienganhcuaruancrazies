import { optionalEnv } from "./env";

/**
 * Xác minh CAPTCHA Cloudflare Turnstile ở phía server. Có 3 chế độ (chọn bằng biến môi trường):
 *
 *  1. "supabase" — SUPABASE_CAPTCHA_ENABLED=true: Supabase Auth tự xác minh token (bật trong Dashboard →
 *     Authentication → Attack Protection). Server chỉ kiểm tra có token rồi chuyển nó cho Supabase.
 *     Đây là chế độ nên dùng trên production, vì chỉ có nó chặn được kẻ gọi thẳng /auth/v1/* bằng
 *     publishable key (công khai) để bỏ qua form của ứng dụng. Token Turnstile chỉ dùng được MỘT lần,
 *     nên ở chế độ này server KHÔNG tự gọi siteverify nữa.
 *  2. "app" — có TURNSTILE_SECRET_KEY: server tự gọi siteverify (chỉ bảo vệ form của ứng dụng).
 *  3. "off" — dev/test (NODE_ENV khác production): không kiểm tra. Trên production mà thiếu cấu hình thì
 *     TỪ CHỐI (ném lỗi), trừ khi chủ động đặt CAPTCHA_DISABLED=true.
 */
export const CAPTCHA_FIELD = "cf-turnstile-response";
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN = 4096;

export const captchaEnabled = (): boolean => Boolean(optionalEnv("TURNSTILE_SECRET_KEY"));

/** Supabase Auth đang tự xác minh CAPTCHA (token phải được truyền vào các lệnh auth). */
export const supabaseCaptcha = (): boolean => optionalEnv("SUPABASE_CAPTCHA_ENABLED") === "true";

const optedOut = (): boolean => optionalEnv("CAPTCHA_DISABLED") === "true";

const validShape = (t: unknown): t is string => typeof t === "string" && t.length > 0 && t.length <= MAX_TOKEN;

/** Trả true nếu CAPTCHA tắt hoặc token hợp lệ. Lỗi mạng khi gọi Cloudflare sẽ ném lỗi (chặn, không cho qua). */
export async function verifyCaptcha(token: unknown, ip?: string): Promise<boolean> {
  const secret = optionalEnv("TURNSTILE_SECRET_KEY");
  if (!secret) {
    if (process.env.NODE_ENV === "production" && !optedOut()) {
      // Đóng cửa: thiếu cấu hình trên production không được âm thầm tắt CAPTCHA.
      throw new Error("Thiếu TURNSTILE_SECRET_KEY trên production (đặt CAPTCHA_DISABLED=true nếu thật sự muốn tắt CAPTCHA)");
    }
    return true;
  }
  if (!validShape(token)) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") body.set("remoteip", ip);
  const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Turnstile siteverify HTTP ${res.status}`);
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}

export type CaptchaCheck = { ok: boolean; captchaToken?: string };

/**
 * Cửa duy nhất cho server action. `captchaToken` (nếu có) phải được truyền tiếp vào lệnh Supabase Auth
 * (`options.captchaToken`) vì chính Supabase sẽ xác minh nó.
 */
export async function checkCaptcha(token: unknown, ip?: string): Promise<CaptchaCheck> {
  if (supabaseCaptcha()) return validShape(token) ? { ok: true, captchaToken: token } : { ok: false };
  return { ok: await verifyCaptcha(token, ip) };
}
