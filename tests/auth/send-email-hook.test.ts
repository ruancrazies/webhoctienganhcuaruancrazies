import { describe, expect, it, vi } from "vitest";
import { handleSendEmail, MAIL_PER_EMAIL_PER_HOUR, type HookDeps } from "../../src/server/auth/send-email-hook";
import { newSecret, sign } from "./helpers";

const payload = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    user: { id: "u1", email: "Linh@Example.com" },
    email_data: { token: "123456", token_hash: "h", email_action_type: "signup", redirect_to: "", site_url: "" },
    ...over,
  });

function setup(over: Partial<HookDeps> = {}) {
  const secret = newSecret();
  const deferred: Array<() => Promise<void>> = [];
  const sendMail = vi.fn().mockResolvedValue(undefined);
  const rateLimit = vi.fn().mockResolvedValue(true);
  const deps: HookDeps = { secret, rateLimit, sendMail, defer: (t) => deferred.push(t), budgetMs: 50, ...over };
  const call = (body: string, headers = sign(body, deps.secret)) => handleSendEmail(body, headers, deps);
  return { secret, deps, deferred, sendMail, rateLimit, call };
}

describe("handleSendEmail", () => {
  it("gửi mail và trả 200 {}", async () => {
    const { call, sendMail } = setup();
    const r = await call(payload());
    expect(r).toEqual({ status: 200, body: {} });
    expect(sendMail).toHaveBeenCalledOnce();
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("Linh@Example.com");
    expect(mail.html).toContain("123456");
  });

  it("chữ ký sai → 401 và KHÔNG gửi mail, không đụng tới rate limit", async () => {
    const { call, sendMail, rateLimit, deps } = setup();
    const body = payload();
    const r = await handleSendEmail(body, sign(body, newSecret()), deps);
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: { http_code: 401, message: expect.any(String) } });
    expect(sendMail).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
    void call;
  });

  it("thiếu header chữ ký → 401", async () => {
    const { deps, sendMail } = setup();
    const r = await handleSendEmail(payload(), new Headers(), deps);
    expect(r.status).toBe(401);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("body không phải JSON (đã ký đúng) → 400", async () => {
    const { call } = setup();
    expect((await call("không phải json")).status).toBe(400);
  });

  it("thiếu trường bắt buộc → 400", async () => {
    const { call, sendMail } = setup();
    expect((await call(JSON.stringify({ user: {}, email_data: {} }))).status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("loại email chưa hỗ trợ → 400", async () => {
    const { call, sendMail } = setup();
    const body = payload({ email_data: { token: "123456", email_action_type: "invite" } });
    const r = await call(body);
    expect(r.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("mã không phải số → 400, không gửi", async () => {
    const { call, sendMail } = setup();
    const r = await call(payload({ email_data: { token: "<b>x</b>", email_action_type: "signup" } }));
    expect(r.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("vượt giới hạn gửi cho một email → 429, không gửi", async () => {
    const { call, sendMail, rateLimit } = setup({ rateLimit: vi.fn().mockResolvedValue(false) });
    const r = await call(payload());
    expect(r.status).toBe(429);
    expect(sendMail).not.toHaveBeenCalled();
    void rateLimit;
  });

  it("khóa giới hạn không chứa email dạng rõ, không phân biệt hoa thường", async () => {
    const { call, rateLimit } = setup();
    await call(payload());
    await call(payload({ user: { id: "u1", email: "LINH@example.COM" } }));
    const [k1, win, max] = rateLimit.mock.calls[0];
    expect(k1).toMatch(/^mail:[0-9a-f]{32}$/);
    expect(k1).not.toContain("linh");
    expect(win).toBe(3600);
    expect(max).toBe(MAIL_PER_EMAIL_PER_HOUR);
    expect(rateLimit.mock.calls[1][0]).toBe(k1);
  });

  it("gửi mail lỗi → 502 để Auth báo cho người dùng", async () => {
    const { call } = setup({ sendMail: vi.fn().mockRejectedValue(new Error("Apps Script từ chối")) });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await call(payload());
    spy.mockRestore();
    expect(r.status).toBe(502);
    expect(r.body).toEqual({ error: { http_code: 502, message: expect.any(String) } });
  });

  it("gửi chậm hơn ngân sách → vẫn trả 200 và tiếp tục ở nền", async () => {
    let finish!: () => void;
    const slow = new Promise<void>((res) => (finish = res));
    const sendMail = vi.fn().mockReturnValue(slow);
    const { call, deferred } = setup({ sendMail, budgetMs: 10 });

    const r = await call(payload());
    expect(r).toEqual({ status: 200, body: {} });
    expect(deferred).toHaveLength(1);

    finish();
    await expect(deferred[0]()).resolves.toBeUndefined();
    expect(sendMail).toHaveBeenCalledOnce(); // không gửi lần hai
  });

  it("gửi chậm rồi mới lỗi → chỉ ghi log ở nền, không ném lỗi", async () => {
    let fail!: (e: Error) => void;
    const slow = new Promise<void>((_, rej) => (fail = rej));
    const { call, deferred } = setup({ sendMail: vi.fn().mockReturnValue(slow), budgetMs: 10 });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await call(payload())).status).toBe(200);
    fail(new Error("quota"));
    await expect(deferred[0]()).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("gửi nhanh thì không đẩy việc ra nền", async () => {
    const { call, deferred } = setup();
    await call(payload());
    expect(deferred).toHaveLength(0);
  });
});
