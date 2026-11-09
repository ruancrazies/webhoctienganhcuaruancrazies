import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn }));
vi.mock("../../src/server/repo/scenes", () => ({ getSceneConfig: h.get }));

const GOOD = { scenes: [{ key: "tet", greeting: "x", motionEnabled: true, status: "published", pinned: false }], schedules: [] };

async function fresh() {
  vi.resetModules();
  return import("../../src/features/login-scene/getActiveScene");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.get.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("loadSceneConfig: DB treo hoặc lỗi không làm trang đăng nhập chậm", () => {
  it("DB trả lời kịp → dùng cấu hình", async () => {
    h.get.mockResolvedValue(GOOD);
    const { loadSceneConfig } = await fresh();
    expect(await loadSceneConfig()).toBe(GOOD);
  });

  it("DB treo → sau 1,2 giây trả cấu hình rỗng; lượt kế tiếp trả NGAY (không chờ lại)", async () => {
    h.get.mockReturnValue(new Promise(() => {}));
    const { loadSceneConfig, SCENE_CONFIG_TIMEOUT_MS, SCENE_CONFIG_BACKOFF_MS } = await fresh();
    const p = loadSceneConfig();
    await vi.advanceTimersByTimeAsync(SCENE_CONFIG_TIMEOUT_MS);
    const empty = await p;
    expect(empty.scenes).toEqual([]);
    expect(h.get).toHaveBeenCalledTimes(1);

    expect((await loadSceneConfig()).scenes).toEqual([]); // không cần tiến đồng hồ: trả ngay
    expect(h.get).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(SCENE_CONFIG_BACKOFF_MS + 1); // hết thời gian tránh → thử lại
    h.get.mockResolvedValue(GOOD);
    expect(await loadSceneConfig()).toBe(GOOD);
  });

  it("DB lỗi ngay → cấu hình rỗng và có ghi log", async () => {
    h.get.mockRejectedValue(new Error("down"));
    const { loadSceneConfig } = await fresh();
    expect((await loadSceneConfig()).scenes).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });
});
