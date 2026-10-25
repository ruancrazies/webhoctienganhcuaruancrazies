/**
 * Content-Security-Policy theo từng request (nonce), đặt bởi src/proxy.ts. Hàm thuần để test được.
 *
 *  - script: chỉ chạy script có nonce ('strict-dynamic' cho phép script đó nạp tiếp, ví dụ Turnstile).
 *    Host Cloudflare để dự phòng cho trình duyệt cũ không hiểu 'strict-dynamic'.
 *  - style: cần 'unsafe-inline' vì React/Next dùng thuộc tính style="…" (không thể gắn nonce).
 *  - Trình duyệt chỉ nói chuyện với chính ứng dụng (connect-src 'self'); Supabase chỉ được gọi từ server.
 *  - Ảnh/âm thanh R2 (NEXT_PUBLIC_MEDIA_BASE_URL) tự được thêm khi có biến này.
 */
const TURNSTILE = "https://challenges.cloudflare.com";

export function buildCsp(nonce: string, opts: { dev?: boolean; mediaOrigin?: string } = {}): string {
  const media = opts.mediaOrigin ? ` ${opts.mediaOrigin}` : "";
  const d = [
    ["default-src", "'self'"],
    ["script-src", `'self' 'nonce-${nonce}' 'strict-dynamic' ${TURNSTILE}${opts.dev ? " 'unsafe-eval'" : ""}`],
    ["style-src", "'self' 'unsafe-inline'"],
    ["img-src", `'self' data: blob:${media}`],
    ["media-src", `'self' blob: data:${media}`],
    ["font-src", "'self' data:"],
    ["connect-src", `'self' ${TURNSTILE}${opts.dev ? " ws: wss:" : ""}`],
    ["frame-src", TURNSTILE],
    ["worker-src", "'self' blob:"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
  ];
  const parts = d.map(([k, v]) => `${k} ${v}`);
  if (!opts.dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/** Chuỗi ngẫu nhiên không đoán được, dùng làm nonce (Web Crypto: chạy được ở proxy lẫn Node). */
export function makeNonce(): string {
  return btoa(crypto.randomUUID());
}

/** Gốc (origin) của NEXT_PUBLIC_MEDIA_BASE_URL nếu hợp lệ, để mở CSP cho ảnh/âm thanh. */
export function mediaOrigin(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? u.origin : undefined;
  } catch {
    return undefined;
  }
}
