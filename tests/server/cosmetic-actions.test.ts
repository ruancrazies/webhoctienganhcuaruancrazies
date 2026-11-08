import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceError } from "../../src/server/errors";

const h = vi.hoisted(() => ({
  user: { id: "u1", email: "a@x.vn" } as { id: string; email: string } | null,
  cookie: undefined as string | undefined,
  calls: [] as string[],
  equip: vi.fn(),
  poll: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (p: string, t?: string) => h.calls.push(`revalidate:${p}${t ? `:${t}` : ""}`) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (n === "eg-theme" && h.cookie !== undefined ? { name: n, value: h.cookie } : undefined),
    set: (n: string, v: string, o: Record<string, unknown>) => {
      h.cookie = v;
      h.calls.push(`cookie:${n}=${v}:${o.sameSite}:${o.path}`);
    },
  }),
}));
vi.mock("@/server/auth/session", () => ({
  requireUser: async () => {
    if (!h.user) throw new Error("redirect");
    return h.user;
  },
  getCurrentUser: async () => h.user,
}));
vi.mock("@/server/auth/users", () => ({ usernameOwner: async () => null }));
vi.mock("@/server/ratelimit", () => ({ hitRateLimit: async () => true }));
vi.mock("@/server/repo", () => ({ getProfile: async () => null, updateAvatar: async () => {}, updateUsername: async () => {}, hitRateLimit: async () => true }));
vi.mock("@/server/services", () => ({ equipCosmetic: h.equip, pollCosmetics: h.poll }));

import { equipCosmeticAction, pollCosmeticsAction } from "../../src/app/(app)/profile/actions";

beforeEach(() => {
  h.user = { id: "u1", email: "a@x.vn" };
  h.cookie = undefined;
  h.calls = [];
  h.equip.mockReset();
  h.poll.mockReset();
});

describe("equipCosmeticAction", () => {
  it("đầu vào sai (loại lạ, mã có ký tự lạ) bị chặn trước khi chạm service", async () => {
    for (const bad of [{ kind: "sticker", id: "forest" }, { kind: "theme", id: "../etc" }, { kind: "theme", id: "A" }, { kind: "theme", id: "x".repeat(40) }, { kind: "theme" }] as never[]) {
      expect(await equipCosmeticAction(bad)).toEqual({ ok: false, error: "Yêu cầu không hợp lệ." });
    }
    expect(h.equip).not.toHaveBeenCalled();
  });

  it("theme: ghi cookie đúng giá trị server trả về và làm mới khung", async () => {
    h.equip.mockResolvedValue({ theme: "forest", auto: false, avatar: null, frame: null });
    expect(await equipCosmeticAction({ kind: "theme", id: "forest" })).toEqual({ ok: true });
    expect(h.calls).toEqual(["cookie:eg-theme=forest:lax:/", "revalidate:/:layout"]);
  });

  it("theme tự động: cookie là 'auto'", async () => {
    h.equip.mockResolvedValue({ theme: "paper", auto: true, avatar: null, frame: null });
    await equipCosmeticAction({ kind: "theme", id: "auto" });
    expect(h.cookie).toBe("auto");
  });

  it("avatar/khung: không đụng cookie theme", async () => {
    h.equip.mockResolvedValue({ theme: "paper", auto: false, avatar: null, frame: "santa" });
    await equipCosmeticAction({ kind: "frame", id: "santa" });
    expect(h.calls).toEqual(["revalidate:/:layout"]);
  });

  it("server từ chối (chưa có món): trả lời nhắn, KHÔNG ghi cookie, KHÔNG làm mới", async () => {
    h.equip.mockRejectedValue(new ServiceError(403, "NOT_OWNED", "Bạn chưa có món này."));
    expect(await equipCosmeticAction({ kind: "theme", id: "twilight" })).toEqual({ ok: false, error: "Bạn chưa có món này." });
    expect(h.calls).toEqual([]);
    expect(h.cookie).toBeUndefined();
  });

  it("lỗi bất ngờ: thông báo chung, không lộ chi tiết", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.equip.mockRejectedValue(new Error("connection refused 10.0.0.5"));
    const r = await equipCosmeticAction({ kind: "theme", id: "dark" });
    expect(r).toMatchObject({ ok: false });
    expect(JSON.stringify(r)).not.toContain("10.0.0.5");
  });
});

describe("pollCosmeticsAction", () => {
  it("chưa đăng nhập: trả 'không có gì', không gọi service", async () => {
    h.user = null;
    expect(await pollCosmeticsAction(true)).toEqual({ messages: [], theme: null, changed: false });
    expect(h.poll).not.toHaveBeenCalled();
  });

  it("chuyển cookie hiện tại cho service và ghi cookie khi tài khoản khác thiết bị", async () => {
    h.cookie = "dark";
    h.poll.mockResolvedValue({ messages: [], theme: "forest", changed: false });
    await pollCosmeticsAction(true);
    expect(h.poll).toHaveBeenCalledWith("u1", { ack: true, cookieTheme: "dark" });
    expect(h.cookie).toBe("forest");
  });

  it("cookie đã khớp: không ghi lại; ack chỉ nhận đúng true", async () => {
    h.cookie = "forest";
    h.poll.mockResolvedValue({ messages: [], theme: "forest", changed: false });
    await pollCosmeticsAction("yes" as never);
    expect(h.poll).toHaveBeenCalledWith("u1", { ack: false, cookieTheme: "forest" });
    expect(h.calls).toEqual([]);
  });

  it("theme null (bị giới hạn tần suất): giữ nguyên cookie", async () => {
    h.cookie = "dark";
    h.poll.mockResolvedValue({ messages: [], theme: null, changed: false });
    await pollCosmeticsAction(false);
    expect(h.cookie).toBe("dark");
  });

  it("service lỗi: nuốt lỗi, trả 'không có gì'", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.poll.mockRejectedValue(new Error("db down"));
    expect(await pollCosmeticsAction(true)).toEqual({ messages: [], theme: null, changed: false });
  });
});
