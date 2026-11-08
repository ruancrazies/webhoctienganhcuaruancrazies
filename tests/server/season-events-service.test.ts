import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventRow, EventTask, ProgressRow } from "../../src/core/seasonEvents";

/** Service sự kiện: repo + giới hạn tần suất giả; danh mục cosmetic thật trong src/cosmetics. */
const repo = vi.hoisted(() => ({
  listPublishedEventsEndingAfter: vi.fn(),
  listEvents: vi.fn(),
  getEvent: vi.fn(),
  listEventTasks: vi.fn(),
  listEventProgress: vi.fn(),
  listCatalogRows: vi.fn(),
  eventStats: vi.fn(),
  bumpEventProgress: vi.fn(),
  claimEventTaskRpc: vi.fn(),
  claimUnlockNotices: vi.fn(),
  recordActivity: vi.fn(),
}));
vi.mock("../../src/server/repo", () => repo);
const rate = vi.hoisted(() => ({ hitRateLimit: vi.fn() }));
vi.mock("../../src/server/ratelimit", () => rate);

import { RepoError } from "../../src/server/errors";
import { claimEventTask, eventNames, getAdminEvent, getMyEvents, listAdminEvents, recordEventProgress } from "../../src/server/services/seasonEvents";

const ME = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-12-20T03:00:00Z"); // 10:00 ngày 20/12 giờ VN
const ctx = { now: NOW };

const ev = (o: Partial<EventRow> = {}): EventRow => ({
  key: "xmas-2026", name: "Giáng sinh 2026", blurb: "Học cùng tuyết", status: "published", claimDays: 2,
  startsAt: "2026-12-14T17:00:00.000Z", endsAt: "2026-12-26T17:00:00.000Z", ...o,
});
const task = (id: number, metric: EventTask["metric"], target: number, o: Partial<EventTask> = {}): EventTask => ({
  id, eventKey: "xmas-2026", metric, target, title: null, rewardXp: 50, rewardCosmetic: null, sort: id, ...o,
});

let events: EventRow[];
let tasks: EventTask[];
let progress: ProgressRow[];
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  events = [ev()];
  tasks = [task(1, "learn", 5), task(2, "play", 1, { rewardXp: 0, rewardCosmetic: "forest" })]; // "forest": theme thật trong registry
  progress = [];
  rate.hitRateLimit.mockResolvedValue(true);
  repo.listPublishedEventsEndingAfter.mockImplementation(async () => events);
  repo.listEvents.mockImplementation(async () => events);
  repo.getEvent.mockImplementation(async (k: string) => events.find((e) => e.key === k) ?? null);
  repo.listEventTasks.mockImplementation(async (keys: string[]) => tasks.filter((t) => keys.includes(t.eventKey)));
  repo.listEventProgress.mockImplementation(async () => progress);
  repo.listCatalogRows.mockResolvedValue([]);
  repo.eventStats.mockResolvedValue(new Map());
  repo.claimUnlockNotices.mockImplementation(async (_u: string, ids: string[]) => ids);
});

describe("getMyEvents", () => {
  it("không có sự kiện → rỗng và KHÔNG đọc nhiệm vụ/tiến độ", async () => {
    events = [];
    expect(await getMyEvents(ME, ctx)).toEqual({ events: [], claimable: 0 });
    expect(repo.listEventTasks).not.toHaveBeenCalled();
    expect(repo.listEventProgress).not.toHaveBeenCalled();
  });

  it("đang diễn ra: đếm ngược, ngày cuối theo giờ VN, nhiệm vụ + thưởng (tên món lấy từ code)", async () => {
    const r = await getMyEvents(ME, ctx);
    expect(r.claimable).toBe(0);
    const e = r.events[0]!;
    expect(e).toMatchObject({ key: "xmas-2026", phase: "running", lastDay: "26/12", countdown: "Còn 6 ngày 14 giờ" });
    expect(e.tasks.map((t) => t.title)).toEqual(["Học 5 từ mới", "Chơi một trò chơi bất kỳ"]);
    expect(e.tasks[1]!.reward).toMatchObject({ id: "forest", kind: "theme" });
    expect(e.tasks[1]!.reward!.name.length).toBeGreaterThan(0);
  });

  it("đếm phần thưởng nhận được ngay, theo từng đợt và tổng", async () => {
    progress = [{ taskId: 1, progress: 5, claimed: false }, { taskId: 2, progress: 1, claimed: true }];
    const r = await getMyEvents(ME, ctx);
    expect(r.events[0]!.claimable).toBe(1);
    expect(r.claimable).toBe(1);
  });

  it("đã hết giờ nhưng còn trong thời gian nhận thưởng: vẫn hiện, vẫn nhận được; hết hạn nhận thì ẩn", async () => {
    progress = [{ taskId: 1, progress: 5, claimed: false }];
    const grace = await getMyEvents(ME, { now: new Date("2026-12-27T17:00:00Z") });
    expect(grace.events[0]).toMatchObject({ phase: "claiming", claimable: 1 });
    expect(grace.events[0]!.countdown).toMatch(/để nhận thưởng/);
    expect(await getMyEvents(ME, { now: new Date("2026-12-29T00:00:00Z") })).toEqual({ events: [], claimable: 0 });
  });

  it("sắp diễn ra: hiện nhưng không nhận được; xa hơn 14 ngày thì ẩn; nháp luôn ẩn", async () => {
    progress = [{ taskId: 1, progress: 5, claimed: false }];
    const soon = await getMyEvents(ME, { now: new Date("2026-12-10T00:00:00Z") });
    expect(soon.events[0]).toMatchObject({ phase: "scheduled", claimable: 0 });
    expect(soon.events[0]!.countdown).toMatch(/^Mở sau/);
    expect((await getMyEvents(ME, { now: new Date("2026-11-20T00:00:00Z") })).events).toEqual([]);
    events = [ev({ status: "draft" })];
    expect((await getMyEvents(ME, ctx)).events).toEqual([]);
  });

  it("nhiều đợt: đang diễn ra trước, sắp mở sau", async () => {
    events = [ev({ key: "tet", name: "Tết", startsAt: "2027-01-01T00:00:00Z", endsAt: "2027-01-10T00:00:00Z" }), ev()];
    expect((await getMyEvents(ME, ctx)).events.map((e) => e.key)).toEqual(["xmas-2026", "tet"]);
  });
});

describe("eventNames", () => {
  it("tên các đợt đang hiện; lỗi DB → rỗng (không làm hỏng Bộ sưu tập)", async () => {
    expect([...(await eventNames(ctx))]).toEqual([["xmas-2026", "Giáng sinh 2026"]]);
    repo.listPublishedEventsEndingAfter.mockRejectedValue(new Error("db down"));
    expect((await eventNames(ctx)).size).toBe(0);
  });
});

describe("recordEventProgress", () => {
  it("chuyển delta và giờ của ctx xuống repo", async () => {
    await recordEventProgress(ME, { learn: 3, review: 0, play: 1, test: 0 }, ctx);
    expect(repo.bumpEventProgress).toHaveBeenCalledWith(ME, NOW, { learn: 3, review: 0, play: 1, test: 0 });
  });

  it("KHÔNG BAO GIỜ ném lỗi (lỗi sự kiện không được làm hỏng vòng chơi đã lưu)", async () => {
    repo.bumpEventProgress.mockRejectedValue(new Error("boom"));
    await expect(recordEventProgress(ME, { learn: 1, review: 0, play: 0, test: 0 }, ctx)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("claimEventTask", () => {
  it("thành công có cosmetic: trả tên món, đánh dấu đã báo để thú cưng không nhắc lại, ghi hoạt động", async () => {
    repo.claimEventTaskRpc.mockResolvedValue({ rewardXp: 0, xp: 900, cosmetic: "forest", granted: true });
    const r = await claimEventTask(ME, 2, ctx);
    expect(repo.claimEventTaskRpc).toHaveBeenCalledWith(ME, 2, NOW);
    expect(r).toMatchObject({ taskId: 2, rewardXp: 0, xp: 900, cosmetic: { id: "forest", kind: "theme", granted: true } });
    expect(repo.claimUnlockNotices).toHaveBeenCalledWith(ME, ["forest"]);
    expect(repo.recordActivity).toHaveBeenCalledWith(ME, "events/claim", expect.objectContaining({ task: 2, cosmetic: "forest", granted: true }));
  });

  it("người đang còn món (granted = false): vẫn thành công, KHÔNG đánh dấu đã báo", async () => {
    repo.claimEventTaskRpc.mockResolvedValue({ rewardXp: 40, xp: 140, cosmetic: "forest", granted: false });
    const r = await claimEventTask(ME, 2, ctx);
    expect(r.cosmetic).toMatchObject({ granted: false });
    expect(repo.claimUnlockNotices).not.toHaveBeenCalled();
  });

  it("thưởng chỉ có XP: cosmetic null", async () => {
    repo.claimEventTaskRpc.mockResolvedValue({ rewardXp: 50, xp: 150, cosmetic: null, granted: false });
    expect((await claimEventTask(ME, 1, ctx)).cosmetic).toBeNull();
  });

  it("việc đánh dấu đã báo lỗi không làm hỏng lần nhận (thưởng đã cấp)", async () => {
    repo.claimEventTaskRpc.mockResolvedValue({ rewardXp: 0, xp: 1, cosmetic: "forest", granted: true });
    repo.claimUnlockNotices.mockRejectedValue(new Error("x"));
    await expect(claimEventTask(ME, 2, ctx)).resolves.toMatchObject({ taskId: 2 });
  });

  it.each([
    ["task_already_claimed", 409, "TASK_CLAIMED"],
    ["task_not_ready", 409, "TASK_NOT_READY"],
    ["event_not_running", 409, "EVENT_CLOSED"],
    ["task_not_found", 404, "TASK_NOT_FOUND"],
    ["cosmetic_unavailable", 409, "REWARD_UNAVAILABLE"],
  ])("lỗi DB %s → ServiceError %i %s", async (tag, status, code) => {
    repo.claimEventTaskRpc.mockRejectedValue(new RepoError("rpc.claim_event_task", `P0001: ${tag}`));
    await expect(claimEventTask(ME, 1, ctx)).rejects.toMatchObject({ status, code });
  });

  it("lỗi lạ được ném nguyên (không nuốt)", async () => {
    repo.claimEventTaskRpc.mockRejectedValue(new Error("mất kết nối"));
    await expect(claimEventTask(ME, 1, ctx)).rejects.toThrow("mất kết nối");
  });

  it("quá giới hạn tần suất → 429 và KHÔNG chạm DB", async () => {
    rate.hitRateLimit.mockResolvedValue(false);
    await expect(claimEventTask(ME, 1, ctx)).rejects.toMatchObject({ status: 429 });
    expect(repo.claimEventTaskRpc).not.toHaveBeenCalled();
  });
});

describe("quản trị", () => {
  it("listAdminEvents: giai đoạn, số nhiệm vụ, thống kê (đợt chưa ai chơi → 0)", async () => {
    events = [ev(), ev({ key: "nap", status: "draft" })];
    repo.eventStats.mockResolvedValue(new Map([["xmas-2026", { participants: 12, claims: 7 }]]));
    const r = await listAdminEvents(ctx);
    expect(r.map((x) => [x.event.key, x.phase, x.taskCount, x.stat])).toEqual([
      ["xmas-2026", "running", 2, { participants: 12, claims: 7 }],
      ["nap", "draft", 0, { participants: 0, claims: 0 }],
    ]);
  });

  it("getAdminEvent: không có → null; có → bản xem trước tiến độ 0, kiểm xuất bản, danh sách món để chọn", async () => {
    expect(await getAdminEvent("khong-co", ctx)).toBeNull();
    const v = (await getAdminEvent("xmas-2026", ctx))!;
    expect(v.phase).toBe("running");
    expect(v.preview.every((t) => t.progress === 0 && !t.claimed)).toBe(true);
    // "forest" chưa đồng bộ vào DB (listCatalogRows rỗng) → lỗi chặn xuất bản
    expect(v.check.errors.join(" ")).toMatch(/cosmetics:sync/);
    expect(v.options.some((o) => o.id === "forest" && o.kind === "theme" && !o.synced)).toBe(true);
  });
});
