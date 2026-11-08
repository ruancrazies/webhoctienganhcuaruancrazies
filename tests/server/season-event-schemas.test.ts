import { describe, expect, it } from "vitest";
import { addTaskSchema, createEventSchema, deleteTaskSchema, duplicateEventSchema, eventOpSchema } from "../../src/features/season-events/schemas";

const ok = { key: "giang-sinh-2026", name: "  Giáng   sinh ", blurb: "", startsOn: "2026-12-15", endsOn: "2026-12-26", claimDays: "2" };

describe("createEventSchema", () => {
  it("hợp lệ: gọn khoảng trắng, mô tả rỗng → null, claimDays ép số", () => {
    expect(createEventSchema.parse(ok)).toEqual({ ...ok, name: "Giáng sinh", blurb: null, claimDays: 2 });
  });
  it("claimDays mặc định 2 khi không gửi", () => {
    const rest: Partial<typeof ok> = { ...ok };
    delete rest.claimDays;
    expect(createEventSchema.parse(rest).claimDays).toBe(2);
  });
  it.each([
    ["mã viết hoa", { key: "Xmas" }],
    ["mã quá ngắn", { key: "a" }],
    ["mã có dấu cách", { key: "xmas 2026" }],
    ["tên rỗng", { name: "   " }],
    ["tên có thẻ HTML", { name: "<b>x</b>" }],
    ["mô tả quá dài", { blurb: "x".repeat(241) }],
    ["ngày không có thật", { startsOn: "2026-02-30" }],
    ["năm ngoài khoảng", { endsOn: "2101-01-01" }],
    ["kết thúc trước bắt đầu", { startsOn: "2026-12-26", endsOn: "2026-12-15" }],
    ["quá 120 ngày", { startsOn: "2026-01-01", endsOn: "2026-12-31" }],
    ["claimDays quá lớn", { claimDays: "15" }],
    ["claimDays âm", { claimDays: "-1" }],
    ["claimDays thập phân", { claimDays: "1.5" }],
  ])("từ chối: %s", (_n, o) => expect(createEventSchema.safeParse({ ...ok, ...o }).success).toBe(false));
  it("đúng 120 ngày vẫn được; 121 thì không", () => {
    expect(createEventSchema.safeParse({ ...ok, startsOn: "2026-01-01", endsOn: "2026-04-30" }).success).toBe(true);
    expect(createEventSchema.safeParse({ ...ok, startsOn: "2026-01-01", endsOn: "2026-05-01" }).success).toBe(false);
  });
});

describe("addTaskSchema", () => {
  const t = { key: "giang-sinh-2026", metric: "learn", target: "20", title: "", rewardXp: "100", rewardCosmetic: "" };
  it("hợp lệ: số được ép, rỗng → null", () => {
    expect(addTaskSchema.parse(t)).toEqual({ key: t.key, metric: "learn", target: 20, title: null, rewardXp: 100, rewardCosmetic: null });
  });
  it("chỉ thưởng món (XP 0) vẫn được; món phải có trong code", () => {
    expect(addTaskSchema.safeParse({ ...t, rewardXp: "0", rewardCosmetic: "forest" }).success).toBe(true);
    expect(addTaskSchema.safeParse({ ...t, rewardCosmetic: "khong-co-trong-code" }).success).toBe(false);
  });
  it.each([
    ["không có thưởng", { rewardXp: "0", rewardCosmetic: "" }],
    ["loại lạ", { metric: "fly" }],
    ["mục tiêu 0", { target: "0" }],
    ["mục tiêu quá lớn", { target: "100001" }],
    ["XP âm", { rewardXp: "-5" }],
    ["XP quá lớn", { rewardXp: "100001" }],
    ["tên có <", { title: "a<b" }],
  ])("từ chối: %s", (_n, o) => expect(addTaskSchema.safeParse({ ...t, ...o }).success).toBe(false));
  it("'all': bỏ qua mục tiêu nhập (DB tự đồng bộ), nên không bắt lỗi mục tiêu", () => {
    expect(addTaskSchema.parse({ ...t, metric: "all", target: "" }).target).toBe(1);
  });
});

describe("các schema còn lại", () => {
  it("eventOpSchema chỉ nhận thao tác có thật", () => {
    expect(eventOpSchema.safeParse({ key: "xmas", op: "publish" }).success).toBe(true);
    expect(eventOpSchema.safeParse({ key: "xmas", op: "drop-table" }).success).toBe(false);
  });
  it("duplicateEventSchema: mã mới phải khác và lịch hợp lệ", () => {
    const d = { key: "xmas-2026", newKey: "xmas-2027", startsOn: "2027-12-15", endsOn: "2027-12-26" };
    expect(duplicateEventSchema.safeParse(d).success).toBe(true);
    expect(duplicateEventSchema.safeParse({ ...d, newKey: "xmas-2026" }).success).toBe(false);
    expect(duplicateEventSchema.safeParse({ ...d, endsOn: "2027-12-01" }).success).toBe(false);
  });
  it("deleteTaskSchema: id nguyên dương", () => {
    expect(deleteTaskSchema.parse({ key: "xmas", id: "7" }).id).toBe(7);
    expect(deleteTaskSchema.safeParse({ key: "xmas", id: "0" }).success).toBe(false);
    expect(deleteTaskSchema.safeParse({ key: "xmas", id: "abc" }).success).toBe(false);
  });
});
