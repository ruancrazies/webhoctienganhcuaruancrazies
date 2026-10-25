import { describe, expect, it } from "vitest";
import { buildCsp, makeNonce, mediaOrigin } from "../../src/lib/csp";

describe("buildCsp", () => {
  const csp = buildCsp("abc123");
  const dir = (name: string) => csp.split("; ").find((d) => d.startsWith(name + " "))!;

  it("script chỉ chạy khi có nonce, không có unsafe-inline/unsafe-eval ở production", () => {
    expect(dir("script-src")).toContain("'nonce-abc123'");
    expect(dir("script-src")).toContain("'strict-dynamic'");
    expect(dir("script-src")).not.toContain("unsafe-inline");
    expect(dir("script-src")).not.toContain("unsafe-eval");
  });

  it("chặn nhúng khung, plugin, đổi base và form ra ngoài", () => {
    expect(dir("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(dir("object-src")).toBe("object-src 'none'");
    expect(dir("base-uri")).toBe("base-uri 'self'");
    expect(dir("form-action")).toBe("form-action 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("cho phép Turnstile (script, khung, kết nối) và không mở thêm host lạ", () => {
    expect(dir("script-src")).toContain("https://challenges.cloudflare.com");
    expect(dir("frame-src")).toBe("frame-src https://challenges.cloudflare.com");
    expect(dir("connect-src")).toBe("connect-src 'self' https://challenges.cloudflare.com");
    expect(csp).not.toMatch(/\*/);
  });

  it("dev: thêm unsafe-eval + websocket, bỏ upgrade-insecure-requests", () => {
    const dev = buildCsp("n", { dev: true });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("ws:");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });

  it("mở CSP cho ảnh/âm thanh R2 khi có NEXT_PUBLIC_MEDIA_BASE_URL", () => {
    const withMedia = buildCsp("n", { mediaOrigin: "https://media.example.com" });
    expect(withMedia).toContain("img-src 'self' data: blob: https://media.example.com");
    expect(withMedia).toContain("media-src 'self' blob: data: https://media.example.com");
  });
});

describe("makeNonce / mediaOrigin", () => {
  it("nonce khác nhau mỗi lần và chỉ gồm ký tự base64", () => {
    const a = makeNonce();
    expect(a).not.toBe(makeNonce());
    expect(a).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
  it("mediaOrigin chỉ nhận https hợp lệ và chỉ lấy origin", () => {
    expect(mediaOrigin("https://media.example.com/a/b?x=1")).toBe("https://media.example.com");
    expect(mediaOrigin("http://media.example.com")).toBeUndefined();
    expect(mediaOrigin("javascript:alert(1)")).toBeUndefined();
    expect(mediaOrigin("khong-phai-url")).toBeUndefined();
    expect(mediaOrigin(undefined)).toBeUndefined();
  });
});
