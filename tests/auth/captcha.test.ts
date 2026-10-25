import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captchaEnabled, verifyCaptcha } from "../../src/server/captcha";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TURNSTILE_SECRET_KEY;
});

describe("verifyCaptcha", () => {
  it("không có secret → tắt CAPTCHA, luôn cho qua và không gọi mạng", async () => {
    expect(captchaEnabled()).toBe(false);
    expect(await verifyCaptcha(undefined)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bật CAPTCHA: thiếu/rỗng/quá dài token → từ chối, không gọi mạng", async () => {
    process.env.TURNSTILE_SECRET_KEY = "s";
    expect(captchaEnabled()).toBe(true);
    expect(await verifyCaptcha(undefined)).toBe(false);
    expect(await verifyCaptcha("")).toBe(false);
    expect(await verifyCaptcha("x".repeat(5000))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gửi secret + token (+ IP) tới Cloudflare và theo kết quả success", async () => {
    process.env.TURNSTILE_SECRET_KEY = "s";
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
    expect(await verifyCaptcha("tok", "1.2.3.4")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("challenges.cloudflare.com/turnstile/v0/siteverify");
    const body = init.body as URLSearchParams;
    expect(body.get("secret")).toBe("s");
    expect(body.get("response")).toBe("tok");
    expect(body.get("remoteip")).toBe("1.2.3.4");

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: false }) });
    expect(await verifyCaptcha("bad")).toBe(false);
  });

  it("Cloudflare lỗi HTTP → ném lỗi (chặn, không cho qua)", async () => {
    process.env.TURNSTILE_SECRET_KEY = "s";
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(verifyCaptcha("tok")).rejects.toThrow();
  });
});
