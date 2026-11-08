import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  admin: "u-admin" as string | "unauth" | "forbidden",
  limitOk: true,
  calls: [] as string[],
  cfg: { scenes: [{ key: "halloween", greeting: null, status: "draft", pinned: false, motionEnabled: true }], schedules: [] as unknown[] },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  updateTag: (t: string) => h.calls.push(`updateTag:${t}`),
  revalidatePath: (p: string) => h.calls.push(`revalidatePath:${p}`),
  unstable_cache: <T>(f: T) => f,
}));
vi.mock("@/server/auth/session", () => {
  class UnauthorizedError extends Error {}
  class ForbiddenError extends Error {}
  return {
    UnauthorizedError,
    ForbiddenError,
    requireAdminId: async () => {
      if (h.admin === "unauth") throw new UnauthorizedError();
      if (h.admin === "forbidden") throw new ForbiddenError();
      return h.admin;
    },
  };
});
vi.mock("@/server/ratelimit", () => ({ hitRateLimit: async () => h.limitOk }));
vi.mock("@/server/repo", () => ({
  getSceneConfig: async () => h.cfg,
  upsertScene: async (key: string, patch: unknown) => (h.calls.push(`upsert:${key}:${JSON.stringify(patch)}`), { key, ...(patch as object) }),
  setPinnedScene: async (key: string | null) => void h.calls.push(`pin:${key}`),
  addSchedule: async (...a: unknown[]) => (h.calls.push(`addSchedule:${a.join(",")}`), { id: 1, sceneKey: a[0], startsOn: a[1], endsOn: a[2], priority: a[3] }),
  deleteSchedule: async (_k: string, id: number) => (h.calls.push(`deleteSchedule:${id}`), id === 404 ? null : { id }),
  writeAudit: async (admin: string, action: string, target: string) => void h.calls.push(`audit:${admin}:${action}:${target}`),
}));

import { addScheduleAction, deleteScheduleAction, pinSceneAction, saveSceneAction } from "../../src/app/(app)/admin/scenes/actions";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => {
  h.admin = "u-admin";
  h.limitOk = true;
  h.calls = [];
});

describe("server action quản trị Scene", () => {
  it("người không phải admin bị từ chối và KHÔNG chạm DB", async () => {
    h.admin = "forbidden";
    const r = await pinSceneAction({}, fd({ key: "halloween", pin: "1" }));
    expect(r.error).toMatch(/không có quyền/i);
    expect(h.calls).toEqual([]);
  });

  it("chưa đăng nhập: báo hết phiên", async () => {
    h.admin = "unauth";
    expect((await saveSceneAction({}, fd({ key: "halloween", greeting: "", status: "published" }))).error).toMatch(/đăng nhập/);
    expect(h.calls).toEqual([]);
  });

  it("dữ liệu sai bị chặn trước khi tới DB (kể cả scene không có trong code)", async () => {
    expect((await pinSceneAction({}, fd({ key: "khong-co", pin: "1" }))).error).toBeTruthy();
    expect((await saveSceneAction({}, fd({ key: "halloween", greeting: "<b>x</b>", status: "published" }))).error).toBeTruthy();
    expect((await addScheduleAction({}, fd({ key: "halloween", startsOn: "2026-10-25", endsOn: "2026-10-01", priority: "0" }))).error).toBeTruthy();
    expect(h.calls).toEqual([]);
  });

  it("quá giới hạn tốc độ thì dừng", async () => {
    h.limitOk = false;
    expect((await pinSceneAction({}, fd({ key: "halloween", pin: "1" }))).error).toMatch(/quá nhanh/);
    expect(h.calls).toEqual([]);
  });

  it("ghim: ghi DB, ghi nhật ký, xóa cache để có hiệu lực ngay", async () => {
    const r = await pinSceneAction({}, fd({ key: "halloween", pin: "1" }));
    expect(r.ok).toBeTruthy();
    expect(h.calls).toEqual(["pin:halloween", "audit:u-admin:scene.pin:scene:halloween", "updateTag:login-scenes", "revalidatePath:/admin/scenes"]);
  });

  it("bỏ ghim gửi null", async () => {
    await pinSceneAction({}, fd({ key: "halloween", pin: "0" }));
    expect(h.calls[0]).toBe("pin:null");
    expect(h.calls[1]).toContain("scene.unpin");
  });

  it("lưu: câu chào rỗng → null, checkbox tắt → motionEnabled=false", async () => {
    await saveSceneAction({}, fd({ key: "halloween", greeting: "  ", status: "published" }));
    expect(h.calls[0]).toBe('upsert:halloween:{"greeting":null,"status":"published","motionEnabled":false}');
  });

  it("thêm/xóa lịch đều ghi nhật ký và xóa cache", async () => {
    await addScheduleAction({}, fd({ key: "halloween", startsOn: "2026-10-25", endsOn: "2026-11-01", priority: "7" }));
    expect(h.calls).toContain("addSchedule:halloween,2026-10-25,2026-11-01,7");
    expect(h.calls).toContain("updateTag:login-scenes");
    h.calls = [];
    const r = await deleteScheduleAction({}, fd({ key: "halloween", id: "404" }));
    expect(r.ok).toMatch(/đã được xóa/); // xóa lịch không còn: không ghi nhật ký
    expect(h.calls.some((c) => c.startsWith("audit"))).toBe(false);
  });
});
