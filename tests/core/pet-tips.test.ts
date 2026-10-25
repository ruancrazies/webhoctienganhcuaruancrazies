import { describe, expect, it } from "vitest";
import { breakReminder, BREAK_AFTER_MIN, greetingFor, STUDY_TIPS } from "../../src/core/pet-tips";

describe("pet-tips", () => {
  it("lời chào đổi theo giờ và có tên", () => {
    expect(greetingFor(8)).toContain("buổi sáng");
    expect(greetingFor(12)).toContain("trưa");
    expect(greetingFor(15)).toContain("Chiều");
    expect(greetingFor(20)).toContain("Tối");
    expect(greetingFor(2)).toContain("Khuya");
    expect(greetingFor(8, "An")).toContain(", An!");
  });

  it("phủ đủ 24 giờ, không có giờ nào trả chuỗi rỗng", () => {
    for (let h = 0; h < 24; h++) expect(greetingFor(h).length).toBeGreaterThan(5);
  });

  it("nhắc nghỉ nêu đúng số phút; có sẵn mẹo", () => {
    expect(breakReminder(BREAK_AFTER_MIN)).toContain(String(BREAK_AFTER_MIN));
    expect(STUDY_TIPS.length).toBeGreaterThan(0);
  });
});
