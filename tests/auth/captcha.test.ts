import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captchaEnabled, checkCaptcha, supabaseCaptcha, verifyCaptcha } from "../../src/server/captcha";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.SUPABASE_CAPTCHA_ENABLED;
  delete process.env.CAPTCHA_DISABLED;
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

describe("production: đóng cửa khi thiếu cấu hình", () => {
  it("thiếu TURNSTILE_SECRET_KEY → ném lỗi, KHÔNG âm thầm cho qua", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(verifyCaptcha("tok")).rejects.toThrow(/TURNSTILE_SECRET_KEY/);
    await expect(checkCaptcha("tok")).rejects.toThrow(/TURNSTILE_SECRET_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("CAPTCHA_DISABLED=true là lối thoát có chủ đích", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.CAPTCHA_DISABLED = "true";
    expect(await verifyCaptcha(undefined)).toBe(true);
  });

  it("có secret thì production vẫn kiểm tra bình thường", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.TURNSTILE_SECRET_KEY = "s";
    expect(await verifyCaptcha(undefined)).toBe(false);
  });
});

describe("checkCaptcha", () => {
  it("chế độ app: tự gọi siteverify, không trả token để chuyển tiếp", async () => {
    process.env.TURNSTILE_SECRET_KEY = "s";
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
    expect(supabaseCaptcha()).toBe(false);
    expect(await checkCaptcha("tok", "1.2.3.4")).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("chế độ supabase: KHÔNG gọi siteverify (token chỉ dùng một lần), trả token để chuyển cho Supabase", async () => {
    process.env.SUPABASE_CAPTCHA_ENABLED = "true";
    expect(supabaseCaptcha()).toBe(true);
    expect(await checkCaptcha("tok")).toEqual({ ok: true, captchaToken: "tok" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("chế độ supabase: thiếu/rỗng/quá dài token → từ chối sớm", async () => {
    process.env.SUPABASE_CAPTCHA_ENABLED = "true";
    expect((await checkCaptcha(undefined)).ok).toBe(false);
    expect((await checkCaptcha("")).ok).toBe(false);
    expect((await checkCaptcha("x".repeat(5000))).ok).toBe(false);
  });

  it("chế độ supabase hoạt động cả trên production dù không có TURNSTILE_SECRET_KEY", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.SUPABASE_CAPTCHA_ENABLED = "true";
    expect((await checkCaptcha("tok")).ok).toBe(true);
  });
});
