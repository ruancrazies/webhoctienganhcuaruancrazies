import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../../src/core/cosmetics";
import type { EventRow, EventTask } from "../../src/core/seasonEvents";

const h = vi.hoisted(() => ({
  admin: "u-admin" as string,
  limitOk: true,
  calls: [] as string[],
  events: new Map<string, unknown>(),
  tasks: [] as unknown[],
  catalog: new Map<string, unknown>(),
  failWith: null as null | (Error & { code?: string }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => h.calls.push(`revalidate:${p}`) }));
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
const maybeFail = () => {
  if (h.failWith) throw h.failWith;
};
vi.mock("@/server/repo", () => ({
  getEvent: async (k: string) => h.events.get(k) ?? null,
  listEventTasks: async () => h.tasks,
  createEvent: async (i: { key: string }) => (maybeFail(), h.calls.push(`create:${i.key}`), { ...i, status: "draft" }),
  updateEvent: async (k: string, patch: Record<string, unknown>) => (h.calls.push(`update:${k}:${Object.keys(patch).sort().join(",")}`), { ...(h.events.get(k) as object), ...patch }),
  deleteEvent: async (k: string) => (maybeFail(), h.calls.push(`delete:${k}`), h.events.get(k)),
  duplicateEvent: async (a: string, b: string) => (maybeFail(), void h.calls.push(`dup:${a}->${b}`)),
  addEventTask: async (t: { metric: string }) => (maybeFail(), h.calls.push(`addTask:${t.metric}`), { id: 1, ...t }),
  deleteEventTask: async (_k: string, id: number) => (h.calls.push(`delTask:${id}`), id === 404 ? null : { id }),
  writeAudit: async (a: string, action: string, target: string) => void h.calls.push(`audit:${a}:${action}:${target}`),
}));
vi.mock("@/server/services", () => ({ adminCatalog: async () => h.catalog }));

import {
  addTaskAction, createEventAction, deleteTaskAction, duplicateEventAction, eventOpAction, saveEventAction,
} from "../../src/app/(app)/admin/events/actions";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const NOW = new Date("2026-12-20T03:00:00Z");
const ev = (o: Partial<EventRow> = {}): EventRow => ({ key: "xmas", name: "Xmas", blurb: null, status: "draft", claimDays: 2, startsAt: "2026-12-14T17:00:00.000Z", endsAt: "2026-12-26T17:00:00.000Z", ...o });
const task = (id: number, metric: EventTask["metric"], cos: string | null = null): EventTask => ({ id, eventKey: "xmas", metric, target: 1, title: null, rewardXp: 10, rewardCosmetic: cos, sort: id });
const item = (id: string, o: Partial<CatalogItem> = {}): CatalogItem => ({ id, kind: "frame", name: id, rarity: "rare", unlock: { type: "event", event: "xmas" }, durationDays: 30, active: true, availableFrom: null, availableUntil: null, synced: true, ...o });
const put = (e: EventRow) => h.events.set(e.key, e);
const dbErr = (message: string, code?: string) => Object.assign(new Error(message), { code });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.admin = "u-admin";
  h.limitOk = true;
  h.calls = [];
  h.events = new Map();
  h.tasks = [task(1, "learn", "hat")];
  h.catalog = new Map([["hat", item("hat")]]);
  h.failWith = null;
});
afterEach(() => vi.useRealTimers());

const NEW = { key: "xmas-2027", name: "Xmas 2027", blurb: "", startsOn: "2027-12-15", endsOn: "2027-12-26", claimDays: "2" };

describe("quyền và giới hạn", () => {
  it("không phải admin / chưa đăng nhập / quá nhanh: từ chối và KHÔNG chạm DB", async () => {
    h.admin = "forbidden";
    expect((await createEventAction({}, fd(NEW))).error).toMatch(/không có quyền/);
    h.admin = "unauth";
    expect((await createEventAction({}, fd(NEW))).error).toMatch(/đăng nhập/);
    h.admin = "u-admin";
    h.limitOk = false;
    expect((await createEventAction({}, fd(NEW))).error).toMatch(/quá nhanh/);
    expect(h.calls).toEqual([]);
  });

  it("dữ liệu sai bị chặn trước khi tới DB", async () => {
    expect((await createEventAction({}, fd({ ...NEW, key: "BAD KEY" }))).error).toBeTruthy();
    expect((await createEventAction({}, fd({ ...NEW, endsOn: "2027-01-01" }))).error).toBeTruthy();
    expect((await eventOpAction({}, fd({ key: "xmas", op: "drop" }))).error).toBeTruthy();
    expect(h.calls).toEqual([]);
  });
});

describe("tạo / nhân bản", () => {
  it("tạo: ghi nhật ký, làm mới trang quản trị và trang người chơi", async () => {
    const r = await createEventAction({}, fd(NEW));
    expect(r.ok).toMatch(/nháp/);
    expect(h.calls).toEqual(["create:xmas-2027", "audit:u-admin:event.create:event:xmas-2027", "revalidate:/admin/events", "revalidate:/quests"]);
  });

  it("mã trùng (23505) → câu tiếng Việt, không lộ lỗi DB", async () => {
    h.failWith = dbErr("duplicate key", "23505");
    expect((await createEventAction({}, fd(NEW))).error).toBe("Mã này đã được dùng.");
  });

  it("nhân bản: nguồn phải có; lỗi nguồn từ DB được dịch", async () => {
    put(ev());
    const d = { key: "xmas", newKey: "xmas-2027", startsOn: "2027-12-15", endsOn: "2027-12-26" };
    expect((await duplicateEventAction({}, fd(d))).ok).toMatch(/xmas-2027/);
    expect(h.calls).toContain("dup:xmas->xmas-2027");
    expect((await duplicateEventAction({}, fd({ ...d, key: "khong-co" }))).error).toMatch(/Không tìm thấy/);
  });
});

const SAVE = { key: "xmas", name: "Tên mới", blurb: "Mô tả", startsOn: "2026-12-15", endsOn: "2026-12-26", claimDays: "2" };

describe("lưu (theo giai đoạn)", () => {
  it("nháp: đổi được lịch", async () => {
    put(ev());
    expect((await saveEventAction({}, fd({ ...SAVE, startsOn: "2026-12-01", endsOn: "2026-12-05" }))).ok).toBe("Đã lưu.");
  });

  it("đang diễn ra: không đổi ngày bắt đầu; kéo dài ngày kết thúc thì được", async () => {
    put(ev({ status: "published" }));
    expect((await saveEventAction({}, fd({ ...SAVE, startsOn: "2026-12-10" }))).error).toMatch(/ngày bắt đầu/);
    expect(h.calls.filter((c) => c.startsWith("update"))).toEqual([]);
    expect((await saveEventAction({}, fd({ ...SAVE, endsOn: "2026-12-31" }))).ok).toBe("Đã lưu.");
  });

  it("đã xuất bản: đổi ngày làm cửa nhận của món không còn bao trọn → từ chối, không ghi", async () => {
    put(ev({ status: "published" }));
    h.catalog = new Map([["hat", item("hat", { availableUntil: "2026-12-27T00:00:00Z" })]]);
    const r = await saveEventAction({}, fd({ ...SAVE, endsOn: "2026-12-31" }));
    expect(r.error).toMatch(/Chưa thể lưu.*đóng trước/);
    expect(h.calls.filter((c) => c.startsWith("update"))).toEqual([]);
  });

  it("đã hết giờ làm: lịch khóa; sửa chữ vẫn được", async () => {
    put(ev({ status: "published", endsAt: "2026-12-18T17:00:00.000Z" })); // 19/12: đang trong thời gian nhận thưởng ở 20/12
    expect((await saveEventAction({}, fd({ ...SAVE, endsOn: "2026-12-26" }))).error).toMatch(/nhân bản/);
    expect((await saveEventAction({}, fd({ ...SAVE, endsOn: "2026-12-18" }))).ok).toBe("Đã lưu.");
  });

  it("không có sự kiện → lỗi rõ ràng", async () => {
    expect((await saveEventAction({}, fd(SAVE))).error).toMatch(/Không tìm thấy/);
  });
});

const op = (key: string, o: string) => eventOpAction({}, fd({ key, op: o }));

describe("xuất bản / bỏ xuất bản / kết thúc sớm / xóa", () => {
  it("xuất bản bị chặn khi kiểm tra có lỗi (món chưa đồng bộ), cho phép khi sạch", async () => {
    put(ev());
    h.catalog = new Map([["hat", item("hat", { synced: false })]]);
    expect((await op("xmas", "publish")).error).toMatch(/cosmetics:sync/);
    expect(h.calls.some((c) => c.startsWith("update"))).toBe(false);
    h.catalog = new Map([["hat", item("hat")]]);
    expect((await op("xmas", "publish")).ok).toMatch(/Đã xuất bản/);
    expect(h.calls).toContain("update:xmas:status");
    expect(h.calls).toContain("audit:u-admin:event.publish:event:xmas");
  });

  it("không có nhiệm vụ → không xuất bản được", async () => {
    put(ev());
    h.tasks = [];
    expect((await op("xmas", "publish")).error).toMatch(/Chưa có nhiệm vụ/);
  });

  it("bỏ xuất bản chỉ khi chưa bắt đầu", async () => {
    put(ev({ status: "published", startsAt: "2026-12-25T17:00:00.000Z", endsAt: "2027-01-05T17:00:00.000Z" }));
    expect((await op("xmas", "unpublish")).ok).toBe("Đã đưa về nháp.");
    put(ev({ status: "published" })); // đang diễn ra
    expect((await op("xmas", "unpublish")).error).toMatch(/không dùng được/);
  });

  it("kết thúc sớm: chỉ khi đang diễn ra, đặt ends_at = bây giờ", async () => {
    put(ev({ status: "published" }));
    expect((await op("xmas", "end")).ok).toMatch(/Đã kết thúc sớm/);
    expect(h.calls).toContain("update:xmas:endsAt");
    put(ev());
    expect((await op("xmas", "end")).error).toMatch(/không dùng được/);
  });

  it("xóa: chỉ nháp; đã xuất bản thì từ chối ngay ở ứng dụng", async () => {
    put(ev());
    expect((await op("xmas", "delete")).ok).toMatch(/Đã xóa/);
    put(ev({ status: "published" }));
    h.calls = [];
    expect((await op("xmas", "delete")).error).toMatch(/không dùng được/);
    expect(h.calls.some((c) => c.startsWith("delete"))).toBe(false);
  });

  it("DB là chốt chặn cuối: event_has_progress được dịch", async () => {
    put(ev({ status: "published", startsAt: "2026-12-25T17:00:00.000Z", endsAt: "2027-01-05T17:00:00.000Z" }));
    const repo = await import("@/server/repo");
    vi.spyOn(repo, "updateEvent").mockRejectedValueOnce(dbErr("P0001: event_has_progress"));
    expect((await op("xmas", "unpublish")).error).toBe("Đã có người làm nhiệm vụ nên không thể đưa về nháp.");
  });
});

const TASK = { key: "xmas", metric: "learn", target: "10", title: "", rewardXp: "50", rewardCosmetic: "" };

describe("nhiệm vụ", () => {
  it("thêm vào nháp; không thêm vào sự kiện đã xuất bản", async () => {
    put(ev());
    expect((await addTaskAction({}, fd(TASK))).ok).toBe("Đã thêm nhiệm vụ.");
    expect(h.calls).toContain("addTask:learn");
    put(ev({ status: "published" }));
    expect((await addTaskAction({}, fd(TASK))).error).toMatch(/đã xuất bản/);
  });

  it("tối đa 8 nhiệm vụ", async () => {
    put(ev());
    h.tasks = Array.from({ length: 8 }, (_, i) => task(i + 1, "learn"));
    expect((await addTaskAction({}, fd(TASK))).error).toMatch(/Tối đa 8/);
  });

  it("thiếu thưởng / món không có trong code bị chặn bởi schema", async () => {
    put(ev());
    expect((await addTaskAction({}, fd({ ...TASK, rewardXp: "0" }))).error).toMatch(/phần thưởng/);
    expect((await addTaskAction({}, fd({ ...TASK, rewardCosmetic: "khong-co" }))).error).toMatch(/không tồn tại/);
  });

  it("lỗi DB được dịch: khóa ngoại (món chưa sync), nhiệm vụ 'all' thứ hai", async () => {
    put(ev());
    h.failWith = dbErr("violates foreign key", "23503");
    expect((await addTaskAction({}, fd({ ...TASK, rewardCosmetic: "forest" }))).error).toMatch(/cosmetics:sync/);
    h.failWith = dbErr('duplicate key value violates unique constraint "event_tasks_one_all"', "23505");
    expect((await addTaskAction({}, fd({ ...TASK, metric: "all" }))).error).toMatch(/chỉ có một nhiệm vụ/);
  });

  it("xóa nhiệm vụ: nháp; đã xóa trước đó → thông báo nhẹ", async () => {
    put(ev());
    expect((await deleteTaskAction({}, fd({ key: "xmas", id: "5" }))).ok).toBe("Đã xóa nhiệm vụ.");
    expect((await deleteTaskAction({}, fd({ key: "xmas", id: "404" }))).ok).toMatch(/đã được xóa/);
    put(ev({ status: "published" }));
    expect((await deleteTaskAction({}, fd({ key: "xmas", id: "5" }))).error).toMatch(/đã xuất bản/);
  });
});
