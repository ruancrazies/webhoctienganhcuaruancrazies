import { describe, expect, it } from "vitest";
import { DEFAULT_SCENE_KEY, resolveSceneKey, sceneStatus, vnDate, isIsoDate, type SceneConfig, type SceneRow, type SceneSchedule } from "../../src/core/loginScene";

const known = (k: string) => ["default", "halloween", "giang-sinh", "tet"].includes(k);
const row = (key: string, o: Partial<SceneRow> = {}): SceneRow => ({ key, greeting: null, status: "published", pinned: false, motionEnabled: true, ...o });
let sid = 0;
const sch = (sceneKey: string, startsOn: string, endsOn: string, priority = 0): SceneSchedule => ({ id: ++sid, sceneKey, startsOn, endsOn, priority });
const cfg = (scenes: SceneRow[], schedules: SceneSchedule[] = []): SceneConfig => ({ scenes, schedules });
// 12:00 giờ VN = 05:00 UTC
const vn = (iso: string) => new Date(`${iso}T05:00:00Z`);

describe("vnDate (giờ Việt Nam, UTC+7)", () => {
  it("qua nửa đêm VN thì sang ngày mới dù UTC vẫn là hôm trước", () => {
    expect(vnDate(new Date("2026-10-31T16:59:59Z"))).toBe("2026-10-31"); // 23:59:59 VN
    expect(vnDate(new Date("2026-10-31T17:00:00Z"))).toBe("2026-11-01"); // 00:00:00 VN
  });
});

describe("isIsoDate", () => {
  it("chỉ nhận ngày có thật", () => {
    expect(isIsoDate("2026-12-25")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("25/12/2026")).toBe(false);
    expect(isIsoDate("2026-1-1")).toBe(false);
  });
});

describe("resolveSceneKey", () => {
  it("không có gì → mặc định", () => {
    expect(resolveSceneKey(vn("2026-11-07"), cfg([]), known)).toEqual({ key: DEFAULT_SCENE_KEY, source: "default", row: null });
  });

  it("lịch: bao gồm cả ngày đầu và ngày cuối; ngoài khoảng thì về mặc định", () => {
    const c = cfg([row("halloween")], [sch("halloween", "2026-10-25", "2026-11-01")]);
    expect(resolveSceneKey(vn("2026-10-24"), c, known).key).toBe("default");
    expect(resolveSceneKey(vn("2026-10-25"), c, known)).toMatchObject({ key: "halloween", source: "schedule" });
    expect(resolveSceneKey(vn("2026-11-01"), c, known).key).toBe("halloween");
    expect(resolveSceneKey(vn("2026-11-02"), c, known).key).toBe("default");
  });

  it("mốc đổi lịch đúng nửa đêm giờ VN", () => {
    const c = cfg([row("halloween")], [sch("halloween", "2026-10-25", "2026-11-01")]);
    expect(resolveSceneKey(new Date("2026-11-01T16:59:59Z"), c, known).key).toBe("halloween");
    expect(resolveSceneKey(new Date("2026-11-01T17:00:00Z"), c, known).key).toBe("default");
  });

  it("ghim thắng lịch, kể cả khi lịch đang chạy", () => {
    const c = cfg([row("halloween"), row("giang-sinh", { pinned: true })], [sch("halloween", "2026-10-25", "2026-11-01")]);
    expect(resolveSceneKey(vn("2026-10-28"), c, known)).toMatchObject({ key: "giang-sinh", source: "pinned" });
  });

  it("ghim 'default' = ép về mặc định, bỏ qua lịch", () => {
    const c = cfg([row("default", { pinned: true }), row("halloween")], [sch("halloween", "2026-10-25", "2026-11-01")]);
    expect(resolveSceneKey(vn("2026-10-28"), c, known)).toMatchObject({ key: "default", source: "pinned" });
  });

  it("nháp không bao giờ hiển thị, dù đang ghim hay đang trong lịch", () => {
    const c = cfg([row("halloween", { status: "draft", pinned: true })], [sch("halloween", "2026-10-25", "2026-11-01")]);
    expect(resolveSceneKey(vn("2026-10-28"), c, known).key).toBe("default");
  });

  it("scene đã bị xóa khỏi code bị bỏ qua (không làm hỏng trang)", () => {
    const c = cfg([row("cu-da-xoa", { pinned: true })], [sch("cu-da-xoa", "2026-01-01", "2026-12-31")]);
    expect(resolveSceneKey(vn("2026-06-01"), c, known).key).toBe("default");
  });

  it("trùng lịch: độ ưu tiên cao thắng", () => {
    const c = cfg([row("halloween"), row("giang-sinh")], [sch("halloween", "2026-10-01", "2026-12-31", 1), sch("giang-sinh", "2026-12-15", "2026-12-26", 5)]);
    expect(resolveSceneKey(vn("2026-12-20"), c, known).key).toBe("giang-sinh");
    expect(resolveSceneKey(vn("2026-11-10"), c, known).key).toBe("halloween");
  });

  it("trùng lịch, cùng ưu tiên: lịch bắt đầu muộn hơn (cụ thể hơn) thắng; vẫn bằng nhau thì theo tên", () => {
    const a = cfg([row("halloween"), row("giang-sinh")], [sch("halloween", "2026-12-01", "2026-12-31"), sch("giang-sinh", "2026-12-15", "2026-12-26")]);
    expect(resolveSceneKey(vn("2026-12-20"), a, known).key).toBe("giang-sinh");
    const b = cfg([row("halloween"), row("giang-sinh")], [sch("halloween", "2026-12-15", "2026-12-26"), sch("giang-sinh", "2026-12-15", "2026-12-26")]);
    expect(resolveSceneKey(vn("2026-12-20"), b, known).key).toBe("giang-sinh");
  });

  it("lịch của scene nháp bị bỏ qua, scene xuất bản khác vẫn thắng", () => {
    const c = cfg([row("halloween", { status: "draft" }), row("tet")], [sch("halloween", "2026-01-01", "2026-12-31", 99), sch("tet", "2026-01-01", "2026-12-31", 1)]);
    expect(resolveSceneKey(vn("2026-06-01"), c, known).key).toBe("tet");
  });

  it("source=default vẫn trả dòng cấu hình của scene mặc định (câu chào do admin sửa)", () => {
    const c = cfg([row("default", { greeting: "Chào bạn" })]);
    expect(resolveSceneKey(vn("2026-06-01"), c, known).row?.greeting).toBe("Chào bạn");
  });
});

describe("sceneStatus", () => {
  const now = vn("2026-11-07");
  it("đủ năm trạng thái", () => {
    const c = cfg(
      [row("halloween"), row("giang-sinh"), row("tet", { status: "draft" })],
      [sch("halloween", "2026-10-25", "2026-11-01"), sch("giang-sinh", "2026-12-15", "2026-12-26")],
    );
    const active = resolveSceneKey(now, c, known).key; // halloween đã hết hạn → default
    expect(active).toBe("default");
    expect(sceneStatus("default", now, c, active)).toBe("active");
    expect(sceneStatus("halloween", now, c, active)).toBe("expired");
    expect(sceneStatus("giang-sinh", now, c, active)).toBe("scheduled");
    expect(sceneStatus("tet", now, c, active)).toBe("draft");
    expect(sceneStatus("khong-co-dong", now, c, active)).toBe("draft");
    const d = cfg([row("tet")]);
    expect(sceneStatus("tet", now, d, "default")).toBe("published");
    expect(sceneStatus("giang-sinh", vn("2026-12-20"), c, "giang-sinh")).toBe("active");
  });
});
