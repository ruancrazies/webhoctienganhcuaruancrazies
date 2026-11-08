import { describe, expect, it } from "vitest";
import { deleteScheduleSchema, greetingSchema, pinSchema, saveSceneSchema, scheduleSchema } from "../../src/features/login-scene/schemas";

const ok = { key: "halloween", startsOn: "2026-10-25", endsOn: "2026-11-01", priority: "5" };

describe("greetingSchema", () => {
  it("rút gọn khoảng trắng; rỗng → null", () => {
    expect(greetingSchema.parse("  Chào   bạn \n mới ")).toBe("Chào bạn mới");
    expect(greetingSchema.parse("   ")).toBeNull();
  });
  it("tối đa 80 ký tự", () => {
    expect(greetingSchema.safeParse("a".repeat(80)).success).toBe(true);
    expect(greetingSchema.safeParse("a".repeat(81)).success).toBe(false);
  });
  it("không nhận < > hay ký tự điều khiển (không có đường chèn HTML)", () => {
    expect(greetingSchema.safeParse("<script>alert(1)</script>").success).toBe(false);
    expect(greetingSchema.safeParse("a\u0007b").success).toBe(false);
    expect(greetingSchema.safeParse("Tết 2027 – “Chúc mừng năm mới”").success).toBe(true);
  });
});

describe("scene key", () => {
  it("chỉ nhận scene có trong code (không nhập tự do)", () => {
    expect(pinSchema.safeParse({ key: "halloween", pin: true }).success).toBe(true);
    expect(pinSchema.safeParse({ key: "<img src=x>", pin: true }).success).toBe(false);
    expect(pinSchema.safeParse({ key: "khong-co", pin: true }).success).toBe(false);
    expect(saveSceneSchema.safeParse({ key: "halloween", greeting: "", status: "published", motionEnabled: true }).success).toBe(true);
    expect(saveSceneSchema.safeParse({ key: "halloween", greeting: "", status: "hacked", motionEnabled: true }).success).toBe(false);
  });
});

describe("scheduleSchema", () => {
  it("hợp lệ", () => expect(scheduleSchema.parse(ok)).toMatchObject({ key: "halloween", priority: 5 }));
  it("ngày không có thật / sai định dạng bị từ chối", () => {
    expect(scheduleSchema.safeParse({ ...ok, startsOn: "2026-02-30" }).success).toBe(false);
    expect(scheduleSchema.safeParse({ ...ok, endsOn: "01/11/2026" }).success).toBe(false);
  });
  it("kết thúc trước bắt đầu bị từ chối", () => expect(scheduleSchema.safeParse({ ...ok, endsOn: "2026-10-24" }).success).toBe(false));
  it("một ngày là đủ (bắt đầu = kết thúc)", () => expect(scheduleSchema.safeParse({ ...ok, endsOn: ok.startsOn }).success).toBe(true));
  it("chặn gõ nhầm năm: tối đa 120 ngày", () => {
    expect(scheduleSchema.safeParse({ ...ok, startsOn: "2026-10-01", endsOn: "2027-10-01" }).success).toBe(false);
    expect(scheduleSchema.safeParse({ ...ok, startsOn: "2026-10-01", endsOn: "2026-01-30" }).success).toBe(false);
    expect(scheduleSchema.safeParse({ ...ok, startsOn: "2026-09-01", endsOn: "2026-12-30" }).success).toBe(true); // đúng 120 ngày
    expect(scheduleSchema.safeParse({ ...ok, startsOn: "2026-09-01", endsOn: "2026-12-31" }).success).toBe(false); // 121 ngày
  });
  it("độ ưu tiên: số nguyên 0–100", () => {
    for (const p of ["-1", "101", "1.5", "abc"]) expect(scheduleSchema.safeParse({ ...ok, priority: p }).success, p).toBe(false);
    for (const p of ["0", "100", "42"]) expect(scheduleSchema.safeParse({ ...ok, priority: p }).success, p).toBe(true);
  });
});

describe("deleteScheduleSchema", () => {
  it("id là số nguyên dương", () => {
    expect(deleteScheduleSchema.safeParse({ key: "halloween", id: "12" }).success).toBe(true);
    expect(deleteScheduleSchema.safeParse({ key: "halloween", id: "0" }).success).toBe(false);
    expect(deleteScheduleSchema.safeParse({ key: "halloween", id: "1; drop table" }).success).toBe(false);
  });
});
