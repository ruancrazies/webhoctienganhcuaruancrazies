import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: null as { id: string; email: string } | null, role: "user" }));

vi.mock("server-only", () => ({}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T>(f: T) => f }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("../../src/server/auth/supabase", () => ({
  createSupabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
  }),
}));
vi.mock("../../src/server/repo/profiles", () => ({ getRole: async () => state.role }));

import { ForbiddenError, UnauthorizedError, requireAdmin, requireAdminId } from "../../src/server/auth/session";

beforeEach(() => {
  state.user = { id: "u1", email: "a@x.vn" };
  state.role = "user";
});

describe("requireAdmin / requireAdminId", () => {
  it("chưa đăng nhập: trang → /login, API → UnauthorizedError", async () => {
    state.user = null;
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/login");
    await expect(requireAdminId()).rejects.toBeInstanceOf(UnauthorizedError);
  });
  it("người thường: trang → 404, API → ForbiddenError", async () => {
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");
    await expect(requireAdminId()).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("admin được qua", async () => {
    state.role = "admin";
    await expect(requireAdmin()).resolves.toMatchObject({ id: "u1" });
    await expect(requireAdminId()).resolves.toBe("u1");
  });
});
