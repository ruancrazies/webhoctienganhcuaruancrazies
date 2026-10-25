import { optionalEnv } from "./env";

/**
 * Xác minh CAPTCHA Cloudflare Turnstile ở phía server.
 * Bật khi có TURNSTILE_SECRET_KEY (và NEXT_PUBLIC_TURNSTILE_SITE_KEY cho phần hiển thị).
 * Không có secret → tắt CAPTCHA (dev local, test) và luôn cho qua.
 */
export const CAPTCHA_FIELD = "cf-turnstile-response";
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const captchaEnabled = (): boolean => Boolean(optionalEnv("TURNSTILE_SECRET_KEY"));

/** Trả true nếu CAPTCHA tắt hoặc token hợp lệ. Lỗi mạng khi gọi Cloudflare sẽ ném lỗi (chặn, không cho qua). */
export async function verifyCaptcha(token: unknown, ip?: string): Promise<boolean> {
  const secret = optionalEnv("TURNSTILE_SECRET_KEY");
  if (!secret) return true;
  if (typeof token !== "string" || token.length === 0 || token.length > 4096) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") body.set("remoteip", ip);
  const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Turnstile siteverify HTTP ${res.status}`);
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}
