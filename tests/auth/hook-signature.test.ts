import { describe, expect, it } from "vitest";
import { HookSignatureError, verifyHookSignature } from "../../src/server/auth/hook-signature";
import { newSecret, sign } from "./helpers";

const body = JSON.stringify({ user: { email: "a@b.co" }, email_data: { token: "123456", email_action_type: "signup" } });

describe("verifyHookSignature", () => {
  it("chấp nhận chữ ký đúng", () => {
    const secret = newSecret();
    expect(() => verifyHookSignature(body, sign(body, secret), secret)).not.toThrow();
  });

  it("từ chối khi nội dung bị sửa", () => {
    const secret = newSecret();
    const headers = sign(body, secret);
    expect(() => verifyHookSignature(body.replace("123456", "654321"), headers, secret)).toThrow(HookSignatureError);
  });

  it("từ chối khi ký bằng secret khác", () => {
    expect(() => verifyHookSignature(body, sign(body, newSecret()), newSecret())).toThrow(HookSignatureError);
  });

  it("từ chối khi thiếu header", () => {
    const secret = newSecret();
    expect(() => verifyHookSignature(body, new Headers(), secret)).toThrow(/Thiếu header/);
    const h = sign(body, secret);
    h.delete("webhook-signature");
    expect(() => verifyHookSignature(body, h, secret)).toThrow(HookSignatureError);
  });

  it("từ chối timestamp quá cũ hoặc ở tương lai quá xa (chống phát lại)", () => {
    const secret = newSecret();
    const now = Date.now();
    const old = sign(body, secret, { timestamp: Math.floor(now / 1000) - 3600 });
    const future = sign(body, secret, { timestamp: Math.floor(now / 1000) + 3600 });
    expect(() => verifyHookSignature(body, old, secret, now)).toThrow(/quá hạn/);
    expect(() => verifyHookSignature(body, future, secret, now)).toThrow(/quá hạn/);
  });

  it("chấp nhận khi trong nhiều chữ ký có một chữ ký đúng", () => {
    const secret = newSecret();
    const good = sign(body, secret);
    const h = new Headers(good);
    h.set("webhook-signature", `v1,${Buffer.from("sai").toString("base64")} ${good.get("webhook-signature")}`);
    expect(() => verifyHookSignature(body, h, secret)).not.toThrow();
  });

  it("bỏ qua chữ ký không phải v1", () => {
    const secret = newSecret();
    const good = sign(body, secret);
    const h = new Headers(good);
    h.set("webhook-signature", good.get("webhook-signature")!.replace("v1,", "v2,"));
    expect(() => verifyHookSignature(body, h, secret)).toThrow(HookSignatureError);
  });

  it("từ chối secret rỗng/không hợp lệ", () => {
    expect(() => verifyHookSignature(body, sign(body, newSecret()), "v1,whsec_")).toThrow(HookSignatureError);
  });
});
