import { describe, expect, it } from "vitest";
import type { CatalogItem } from "../../src/core/cosmetics";
import {
  buildTaskViews, canClaim, canDo, canProgress, checkEventEdit, claimEndsAt, countdown, datesOfWindow, eventPhase, fmtLastDay, fmtVnDate, fmtVnDayMonth, instantToVnDate,
  isClaimable, metricTitle, phaseCountdownText, publishCheck, rewardText, sortForPlayers, taskTitle, visibleToPlayers, vnDateToInstant, windowDays, windowFromDates,
  type EventRow, type EventTask, type ProgressRow, type RewardCosmetic,
} from "../../src/core/seasonEvents";

const ev = (o: Partial<EventRow> = {}): EventRow => ({
  key: "xmas-2026", name: "Giáng sinh", blurb: null, status: "published", claimDays: 2,
  startsAt: "2026-12-14T17:00:00.000Z", // 00:00 ngày 15/12 giờ VN
  endsAt: "2026-12-26T17:00:00.000Z", // 00:00 ngày 27/12 giờ VN (hết ngày 26)
  ...o,
});
const at = (s: string) => new Date(s);

describe("ngày giờ Việt Nam", () => {
  it("00:00 giờ VN của một ngày lịch = 17:00 UTC của ngày trước, bất kể múi giờ máy", () => {
    expect(vnDateToInstant("2026-12-15").toISOString()).toBe("2026-12-14T17:00:00.000Z");
    expect(vnDateToInstant("2027-01-01").toISOString()).toBe("2026-12-31T17:00:00.000Z");
    expect(vnDateToInstant("2028-02-29").toISOString()).toBe("2028-02-28T17:00:00.000Z"); // năm nhuận
  });

  it("từ chối ngày không có thật", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "26-12-15", "", "2026-12-15T00:00"]) expect(() => vnDateToInstant(bad), bad).toThrow();
  });

  it("windowFromDates: ngày kết thúc BAO GỒM → mốc loại trừ là 00:00 ngày kế tiếp; datesOfWindow đảo ngược chính xác", () => {
    const w = windowFromDates("2026-12-15", "2026-12-26");
    expect(w.startsAt.toISOString()).toBe(ev().startsAt);
    expect(w.endsAt.toISOString()).toBe(ev().endsAt);
    expect(datesOfWindow({ startsAt: w.startsAt.toISOString(), endsAt: w.endsAt.toISOString() })).toEqual({ startsOn: "2026-12-15", endsOn: "2026-12-26" });
    // sự kiện một ngày
    const one = windowFromDates("2026-12-24", "2026-12-24");
    expect(one.endsAt.getTime() - one.startsAt.getTime()).toBe(86_400_000);
  });

  it("windowDays đếm cả hai đầu; qua ranh giới tháng/năm", () => {
    expect(windowDays("2026-12-15", "2026-12-26")).toBe(12);
    expect(windowDays("2026-12-30", "2027-01-02")).toBe(4);
    expect(windowDays("2026-12-24", "2026-12-24")).toBe(1);
  });

  it("định dạng ngày theo giờ VN, không theo UTC: 20:00 UTC đã là sáng hôm sau ở VN", () => {
    expect(instantToVnDate("2026-12-14T20:00:00Z")).toBe("2026-12-15");
    expect(fmtVnDayMonth("2026-12-14T20:00:00Z")).toBe("15/12");
    expect(fmtVnDate("2026-12-14T20:00:00Z")).toBe("15/12/2026");
    expect(fmtLastDay(ev().endsAt)).toBe("26/12"); // ngày cuối còn làm được, không phải 27/12
  });
});

describe("eventPhase", () => {
  const e = ev();
  it("nháp luôn là nháp, kể cả khi đang trong khoảng thời gian", () => {
    expect(eventPhase(ev({ status: "draft" }), at("2026-12-20T00:00:00Z"))).toBe("draft");
  });

  it("chưa tới giờ → đang diễn ra → còn nhận thưởng → kết thúc; mốc bắt đầu bao gồm, mốc kết thúc loại trừ", () => {
    expect(eventPhase(e, at("2026-12-14T16:59:59Z"))).toBe("scheduled");
    expect(eventPhase(e, at("2026-12-14T17:00:00Z"))).toBe("running");
    expect(eventPhase(e, at("2026-12-26T16:59:59Z"))).toBe("running");
    expect(eventPhase(e, at("2026-12-26T17:00:00Z"))).toBe("claiming");
    expect(eventPhase(e, at("2026-12-28T16:59:59Z"))).toBe("claiming"); // ends + 2 ngày
    expect(eventPhase(e, at("2026-12-28T17:00:00Z"))).toBe("ended");
  });

  it("claimDays = 0: hết giờ là hết nhận thưởng", () => {
    const z = ev({ claimDays: 0 });
    expect(claimEndsAt(z).toISOString()).toBe(z.endsAt);
    expect(eventPhase(z, at("2026-12-26T17:00:00Z"))).toBe("ended");
  });

  it("tiến độ chỉ tăng khi đang diễn ra; nhận thưởng cả lúc diễn ra và lúc còn nhận", () => {
    expect(canProgress("running")).toBe(true);
    expect(canProgress("claiming")).toBe(false);
    expect([canClaim("running"), canClaim("claiming"), canClaim("scheduled"), canClaim("ended"), canClaim("draft")]).toEqual([true, true, false, false, false]);
  });
});

describe("visibleToPlayers / sortForPlayers", () => {
  it("thấy: đang diễn ra, còn nhận thưởng, sắp mở trong 14 ngày; ẩn: nháp, đã kết thúc, sắp mở xa hơn", () => {
    const now = at("2026-12-01T00:00:00Z");
    expect(visibleToPlayers(ev({ status: "draft" }), now)).toBe(false);
    expect(visibleToPlayers(ev(), at("2026-12-01T17:00:00Z"))).toBe(true); // còn 13 ngày
    expect(visibleToPlayers(ev(), at("2026-11-20T00:00:00Z"))).toBe(false); // còn 24 ngày
    expect(visibleToPlayers(ev(), at("2026-12-20T00:00:00Z"))).toBe(true);
    expect(visibleToPlayers(ev(), at("2026-12-27T12:00:00Z"))).toBe(true); // còn nhận thưởng
    expect(visibleToPlayers(ev(), at("2026-12-29T00:00:00Z"))).toBe(false);
  });

  it("thứ tự: đang diễn ra (sắp hết trước) → còn nhận thưởng → sắp mở (sớm trước)", () => {
    const v = (id: string, phase: "running" | "claiming" | "scheduled", startsAt: string, endsAt: string) => ({ id, phase, startsAt, endsAt });
    const list = [
      v("soon-b", "scheduled", "2027-01-10T00:00:00Z", "2027-01-20T00:00:00Z"),
      v("claim", "claiming", "2026-12-01T00:00:00Z", "2026-12-05T00:00:00Z"),
      v("run-late", "running", "2026-12-01T00:00:00Z", "2026-12-30T00:00:00Z"),
      v("soon-a", "scheduled", "2027-01-02T00:00:00Z", "2027-01-05T00:00:00Z"),
      v("run-early", "running", "2026-12-01T00:00:00Z", "2026-12-12T00:00:00Z"),
    ];
    expect(sortForPlayers(list).map((x) => x.id)).toEqual(["run-early", "run-late", "claim", "soon-a", "soon-b"]);
  });
});

describe("countdown", () => {
  const now = at("2026-12-20T00:00:00Z");
  const after = (ms: number) => new Date(now.getTime() + ms);
  const H = 3_600_000;
  it("ngày + giờ, giờ + phút, phút, dưới 1 phút; đã qua → null", () => {
    expect(countdown(after(3 * 24 * H + 4 * H + 5 * 60_000), now)).toBe("3 ngày 4 giờ");
    expect(countdown(after(2 * 24 * H), now)).toBe("2 ngày");
    expect(countdown(after(5 * H + 20 * 60_000), now)).toBe("5 giờ 20 phút");
    expect(countdown(after(3 * H), now)).toBe("3 giờ");
    expect(countdown(after(12 * 60_000), now)).toBe("12 phút");
    expect(countdown(after(30_000), now)).toBe("dưới 1 phút");
    expect(countdown(after(0), now)).toBeNull();
    expect(countdown(after(-1000), now)).toBeNull();
  });

  it("câu theo giai đoạn", () => {
    const e = ev();
    expect(phaseCountdownText(e, "scheduled", at("2026-12-13T17:00:00Z"))).toBe("Mở sau 1 ngày");
    expect(phaseCountdownText(e, "running", at("2026-12-26T07:00:00Z"))).toBe("Còn 10 giờ");
    expect(phaseCountdownText(e, "claiming", at("2026-12-27T17:00:00Z"))).toBe("Còn 1 ngày để nhận thưởng");
    expect(phaseCountdownText(e, "ended", at("2027-02-01T00:00:00Z"))).toBe("");
  });
});

describe("tên nhiệm vụ", () => {
  it("tên mặc định theo loại; tên riêng (đã cắt khoảng trắng) thắng; tên rỗng/khoảng trắng → mặc định", () => {
    expect(metricTitle("learn", 30)).toBe("Học 30 từ mới");
    expect(metricTitle("review", 10)).toBe("Ôn 10 từ cũ");
    expect(metricTitle("play", 1)).toBe("Chơi một trò chơi bất kỳ");
    expect(metricTitle("play", 5)).toBe("Chơi 5 trò chơi");
    expect(metricTitle("test", 1)).toBe("Làm một bài kiểm tra");
    expect(metricTitle("all", 3)).toMatch(/mọi nhiệm vụ/);
    expect(taskTitle({ metric: "learn", target: 5, title: "  Tuần lễ từ vựng " })).toBe("Tuần lễ từ vựng");
    expect(taskTitle({ metric: "learn", target: 5, title: "   " })).toBe("Học 5 từ mới");
    expect(taskTitle({ metric: "learn", target: 5, title: null })).toBe("Học 5 từ mới");
  });
});

describe("buildTaskViews", () => {
  const task = (id: number, metric: EventTask["metric"], target: number, o: Partial<EventTask> = {}): EventTask => ({
    id, eventKey: "xmas-2026", metric, target, title: null, rewardXp: 50, rewardCosmetic: null, sort: id, ...o,
  });
  const HAT: RewardCosmetic = { id: "hat", name: "Nón", kind: "frame", rarity: "rare", durationDays: 30 };
  const rewardOf = (id: string) => (id === "hat" ? HAT : null);
  const tasks = [task(1, "learn", 5), task(2, "play", 2), task(3, "all", 99, { rewardXp: 300, rewardCosmetic: "hat" })];

  it("chưa làm gì → tiến độ 0, chưa xong", () => {
    const v = buildTaskViews(tasks, [], rewardOf);
    expect(v.map((x) => [x.progress, x.done, x.claimed])).toEqual([[0, false, false], [0, false, false], [0, false, false]]);
  });

  it("chặn tiến độ ở mục tiêu; đủ thì done; đã nhận thì claimed", () => {
    const rows: ProgressRow[] = [{ taskId: 1, progress: 9, claimed: false }, { taskId: 2, progress: 1, claimed: false }];
    const v = buildTaskViews(tasks, rows, rewardOf);
    expect(v[0]).toMatchObject({ progress: 5, target: 5, done: true, claimed: false });
    expect(v[1]).toMatchObject({ progress: 1, done: false });
  });

  it("'all' tính từ các nhiệm vụ khác, mục tiêu = số nhiệm vụ khác (bỏ qua target lưu trong dòng), kể cả khi dòng của nó chưa có", () => {
    const one = buildTaskViews(tasks, [{ taskId: 1, progress: 5, claimed: true }], rewardOf)[2]!;
    expect(one).toMatchObject({ target: 2, progress: 1, done: false });
    const both = buildTaskViews(tasks, [{ taskId: 1, progress: 5, claimed: false }, { taskId: 2, progress: 2, claimed: false }], rewardOf)[2]!;
    expect(both).toMatchObject({ target: 2, progress: 2, done: true, rewardXp: 300, reward: HAT });
    expect(both.title).toMatch(/mọi nhiệm vụ/);
  });

  it("sắp theo sort rồi id; món thưởng không còn trong code → reward null (không làm hỏng trang)", () => {
    const shuffled = [task(5, "play", 1, { sort: 1 }), task(4, "learn", 1, { sort: 0, rewardCosmetic: "da-xoa" }), task(6, "review", 1, { sort: 1 })];
    const v = buildTaskViews(shuffled, [], rewardOf);
    expect(v.map((x) => x.id)).toEqual([4, 5, 6]);
    expect(v[0]!.reward).toBeNull();
  });

  it("isClaimable: đủ + chưa nhận + giai đoạn cho nhận", () => {
    const t = { done: true, claimed: false };
    expect(isClaimable(t, "running")).toBe(true);
    expect(isClaimable(t, "claiming")).toBe(true);
    expect(isClaimable(t, "scheduled")).toBe(false);
    expect(isClaimable(t, "ended")).toBe(false);
    expect(isClaimable({ done: true, claimed: true }, "running")).toBe(false);
    expect(isClaimable({ done: false, claimed: false }, "running")).toBe(false);
  });

  it("rewardText: XP, món (loại, độ hiếm bằng chữ, hạn), hoặc cả hai", () => {
    const rar = (r: string) => ({ common: "Thường", rare: "Hiếm", epic: "Sử thi", legendary: "Huyền thoại" })[r]!;
    const kind = (k: string) => ({ theme: "Giao diện", avatar: "Avatar", frame: "Khung" })[k]!;
    expect(rewardText({ rewardXp: 200, reward: null }, rar, kind)).toBe("+200 XP");
    expect(rewardText({ rewardXp: 0, reward: HAT }, rar, kind)).toBe("Khung “Nón” (Hiếm, 30 ngày)");
    expect(rewardText({ rewardXp: 50, reward: { ...HAT, rarity: null, durationDays: null, kind: "avatar" } }, rar, kind)).toBe("+50 XP · Avatar “Nón” (vĩnh viễn)");
  });
});

describe("publishCheck", () => {
  const NOW = at("2026-12-01T00:00:00Z");
  const task = (id: number, metric: EventTask["metric"], cos: string | null = null): EventTask => ({ id, eventKey: "xmas-2026", metric, target: 1, title: null, rewardXp: 10, rewardCosmetic: cos, sort: id });
  const item = (id: string, o: Partial<CatalogItem> = {}): CatalogItem => ({
    id, kind: "frame", name: `Món ${id}`, rarity: "rare", unlock: { type: "event", event: "xmas-2026" }, durationDays: 30, active: true,
    availableFrom: null, availableUntil: null, synced: true, ...o,
  });
  const cat = (...items: CatalogItem[]) => new Map(items.map((i) => [i.id, i]));

  it("hợp lệ: không lỗi, không cảnh báo", () => {
    expect(publishCheck(ev(), [task(1, "learn", "hat"), task(2, "all")], cat(item("hat")), NOW)).toEqual({ errors: [], warnings: [] });
  });

  it("không có nhiệm vụ; chỉ có 'all'", () => {
    expect(publishCheck(ev(), [], cat(), NOW).errors).toEqual(["Chưa có nhiệm vụ nào."]);
    expect(publishCheck(ev(), [task(1, "all")], cat(), NOW).errors[0]).toMatch(/cần ít nhất một nhiệm vụ khác/);
  });

  it("đã quá hạn nhận thưởng → lỗi", () => {
    expect(publishCheck(ev(), [task(1, "learn")], cat(), at("2027-02-01T00:00:00Z")).errors[0]).toMatch(/quá hạn nhận thưởng/);
  });

  it("món thưởng: không còn trong code, chưa sync, ngừng cung cấp, cửa nhận không bao trọn thời gian của sự kiện", () => {
    const e = ev();
    const claimEnd = claimEndsAt(e).toISOString();
    const r = publishCheck(e, [task(1, "learn", "gone"), task(2, "play", "nosync"), task(3, "test", "off"), task(4, "review", "late"), task(5, "learn", "early")], cat(
      item("nosync", { synced: false }),
      item("off", { active: false }),
      item("late", { availableUntil: new Date(new Date(claimEnd).getTime() - 1000).toISOString() }),
      item("early", { availableFrom: new Date(new Date(e.startsAt).getTime() + 1000).toISOString() }),
    ), NOW);
    expect(r.errors).toHaveLength(5);
    expect(r.errors.join("|")).toMatch(/không còn trong code/);
    expect(r.errors.join("|")).toMatch(/cosmetics:sync/);
    expect(r.errors.join("|")).toMatch(/ngừng cung cấp/);
    expect(r.errors.join("|")).toMatch(/đóng trước khi hết hạn nhận thưởng/);
    expect(r.errors.join("|")).toMatch(/mở sau ngày bắt đầu/);
  });

  it("cửa nhận của món vừa khít (đóng đúng lúc hết hạn nhận thưởng) vẫn được", () => {
    const e = ev();
    expect(publishCheck(e, [task(1, "learn", "hat")], cat(item("hat", { availableUntil: claimEndsAt(e).toISOString(), availableFrom: e.startsAt })), NOW).errors).toEqual([]);
  });

  it("cảnh báo (không chặn) khi món không gắn với sự kiện này; mỗi món chỉ báo một lần dù nhiều nhiệm vụ cùng thưởng", () => {
    const r = publishCheck(ev(), [task(1, "learn", "lv"), task(2, "play", "lv"), task(3, "test", "other")], cat(item("lv", { unlock: { type: "level", level: 5 } }), item("other", { unlock: { type: "event", event: "tet-2027" } })), NOW);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(2);
    expect(r.warnings[0]).toMatch(/không có luật “sự kiện”/);
    expect(r.warnings[1]).toMatch(/tet-2027/);
  });
});

describe("checkEventEdit / canDo", () => {
  const old = ev();
  const same = { startsAt: new Date(old.startsAt), endsAt: new Date(old.endsAt), claimDays: old.claimDays };
  const NOW_RUN = at("2026-12-20T00:00:00Z");

  it("nháp và sắp diễn ra: sửa thoải mái", () => {
    const moved = { startsAt: at("2026-12-01T00:00:00Z"), endsAt: at("2026-12-05T00:00:00Z"), claimDays: 5 };
    expect(checkEventEdit(old, moved, "draft", NOW_RUN)).toBeNull();
    expect(checkEventEdit(old, moved, "scheduled", NOW_RUN)).toBeNull();
  });

  it("đang diễn ra: khóa ngày bắt đầu; ngày kết thúc phải còn ở tương lai; kéo dài / đổi số ngày nhận thưởng được", () => {
    expect(checkEventEdit(old, { ...same, startsAt: at("2026-12-10T00:00:00Z") }, "running", NOW_RUN)).toMatch(/ngày bắt đầu/);
    expect(checkEventEdit(old, { ...same, endsAt: at("2026-12-19T00:00:00Z") }, "running", NOW_RUN)).toMatch(/Kết thúc sớm/);
    expect(checkEventEdit(old, { ...same, endsAt: at("2027-01-05T00:00:00Z"), claimDays: 7 }, "running", NOW_RUN)).toBeNull();
  });

  it("còn nhận thưởng / đã kết thúc: khóa mọi thứ về lịch", () => {
    for (const p of ["claiming", "ended"] as const) {
      expect(checkEventEdit(old, same, p, NOW_RUN)).toBeNull(); // không đổi gì (chỉ sửa chữ) thì được
      expect(checkEventEdit(old, { ...same, claimDays: 9 }, p, NOW_RUN)).toMatch(/nhân bản/);
      expect(checkEventEdit(old, { ...same, endsAt: at("2027-01-05T00:00:00Z") }, p, NOW_RUN)).toMatch(/nhân bản/);
    }
  });

  it("canDo: xuất bản ← nháp; bỏ xuất bản ← sắp diễn ra; kết thúc sớm ← đang diễn ra; xóa ← nháp", () => {
    const phases = ["draft", "scheduled", "running", "claiming", "ended"] as const;
    const allowed = (op: Parameters<typeof canDo>[0]) => phases.filter((p) => canDo(op, p));
    expect(allowed("publish")).toEqual(["draft"]);
    expect(allowed("unpublish")).toEqual(["scheduled"]);
    expect(allowed("end")).toEqual(["running"]);
    expect(allowed("delete")).toEqual(["draft"]);
  });
});
