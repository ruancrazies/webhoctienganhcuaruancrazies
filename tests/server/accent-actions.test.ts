import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1", email: "a@x.vn" } as { id: string; email: string } | null,
  calls: [] as string[],
  limited: false,
  fail: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (p: string, t?: string) => h.calls.push(`revalidate:${p}${t ? `:${t}` : ""}`) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: (n: string, v: string, o: Record<string, unknown>) => h.calls.push(`cookie:${n}=${v}:${o.maxAge === 0 ? "xoa" : "ghi"}:${o.sameSite}`),
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
vi.mock("@/server/ratelimit", () => ({ hitRateLimit: async () => !h.limited }));
vi.mock("@/server/repo", () => ({
  getProfile: async () => null,
  updateAvatar: async () => {},
  updateUsername: async () => {},
  updateAccent: async (id: string, a: string | null) => {
    if (h.fail) throw new Error("db down");
    h.calls.push(`db:${id}:${a}`);
  },
}));
vi.mock("@/server/services", () => ({ equipCosmetic: vi.fn(), pollCosmetics: vi.fn() }));

import { setAccentAction } from "../../src/app/(app)/profile/actions";

beforeEach(() => {
  h.user = { id: "u1", email: "a@x.vn" };
  h.calls = [];
  h.limited = false;
  h.fail = false;
});

describe("setAccentAction", () => {
  it("mã lạ / kiểu lạ bị chặn trước khi chạm DB hay cookie", async () => {
    for (const bad of [{ id: "do-ruc-ro" }, { id: "#ff0000" }, { id: "<script>" }, { id: "BIEN" }, { id: 5 }, {}, { id: undefined }] as never[]) {
      expect(await setAccentAction(bad)).toEqual({ ok: false, error: "Yêu cầu không hợp lệ." });
    }
    expect(h.calls).toEqual([]);
  });

  it("mã hợp lệ: ghi tài khoản, ghi cookie, làm mới khung (theo đúng thứ tự)", async () => {
    expect(await setAccentAction({ id: "tim" })).toEqual({ ok: true });
    expect(h.calls).toEqual(["db:u1:tim", "cookie:eg-accent=tim:ghi:lax", "revalidate:/:layout"]);
  });

  it("null = về màu của theme: xóa cookie", async () => {
    expect(await setAccentAction({ id: null })).toEqual({ ok: true });
    expect(h.calls).toEqual(["db:u1:null", "cookie:eg-accent=:xoa:lax", "revalidate:/:layout"]);
  });

  it("vượt giới hạn tốc độ: báo lỗi, không ghi gì", async () => {
    h.limited = true;
    const r = await setAccentAction({ id: "la" });
    expect(r.ok).toBe(false);
    expect(h.calls).toEqual([]);
  });

  it("DB lỗi: báo lỗi chung, không ghi cookie (cookie không lệch khỏi tài khoản)", async () => {
    h.fail = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await setAccentAction({ id: "cam" });
    expect(r.ok).toBe(false);
    expect(h.calls).toEqual([]);
  });

  it("chưa đăng nhập: bị chuyển hướng (ném), không ghi gì", async () => {
    h.user = null;
    await expect(setAccentAction({ id: "do" })).rejects.toThrow("redirect");
    expect(h.calls).toEqual([]);
  });
});
