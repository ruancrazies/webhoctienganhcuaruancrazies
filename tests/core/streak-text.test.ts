import { describe, expect, it } from "vitest";
import { dayNo, displayStreak, startOfDay, startOfNextVnDay, startOfVnDay, touchStreak } from "../../src/core/streak";
import { compact, isNear, lev, nfc, norm } from "../../src/core/text";
import { at } from "./helpers";

describe("streak — ngày theo giờ Việt Nam", () => {
  it("ranh giới ngày là 17:00 UTC (00:00 giờ VN)", () => {
    const d = dayNo(at("2026-10-24T16:59:59Z")); // 23:59:59 VN ngày 24
    expect(dayNo(at("2026-10-24T17:00:00Z"))).toBe(d + 1); // 00:00 VN ngày 25
    expect(dayNo(at("2026-10-24T00:00:00Z"))).toBe(d); // 07:00 VN ngày 24
  });

  it("nhận cả số mili giây", () => {
    expect(dayNo(at("2026-10-24T05:00:00Z").getTime())).toBe(dayNo(at("2026-10-24T05:00:00Z")));
  });

  it("startOfVnDay / startOfNextVnDay", () => {
    expect(startOfVnDay(at("2026-10-24T10:00:00Z")).toISOString()).toBe("2026-10-23T17:00:00.000Z");
    expect(startOfNextVnDay(at("2026-10-24T10:00:00Z")).toISOString()).toBe("2026-10-24T17:00:00.000Z");
    expect(dayNo(startOfDay(20000))).toBe(20000);
    expect(dayNo(new Date(startOfDay(20000).getTime() - 1))).toBe(19999);
  });

  it("touchStreak: lần đầu → 1; cùng ngày giữ nguyên; liền ngày +1; bỏ lỡ → 1", () => {
    const fresh = { lastDay: null, streak: 0, bestStreak: 0 };
    const a = touchStreak(fresh, 100);
    expect(a).toEqual({ lastDay: 100, streak: 1, bestStreak: 1 });
    expect(touchStreak(a, 100)).toBe(a);
    const b = touchStreak(a, 101);
    expect(b).toEqual({ lastDay: 101, streak: 2, bestStreak: 2 });
    expect(touchStreak(b, 103)).toEqual({ lastDay: 103, streak: 1, bestStreak: 2 });
  });

  it("displayStreak: bỏ lỡ hơn một ngày thì hiển thị 0", () => {
    const p = { lastDay: 100, streak: 5, bestStreak: 9 };
    expect(displayStreak(p, 100)).toBe(5);
    expect(displayStreak(p, 101)).toBe(5);
    expect(displayStreak(p, 102)).toBe(0);
    expect(displayStreak({ lastDay: null, streak: 0, bestStreak: 0 }, 5)).toBe(0);
  });
});

describe("text", () => {
  it("norm: chữ thường, bỏ dấu, gộp khoảng trắng, bỏ dấu câu hai đầu", () => {
    expect(norm("  Café  ")).toBe("cafe");
    expect(norm("Ice   Cream.")).toBe("ice cream");
    expect(norm("“Hello!”")).toBe("hello");
    expect(norm("don’t")).toBe("don't");
    expect(norm("well-known")).toBe("well-known");
  });

  it("nfc giữ dấu tiếng Việt (không bỏ dấu như norm)", () => {
    expect(nfc("  quả táo ")).toBe("quả táo");
    expect(nfc("ma")).not.toBe(nfc("má"));
    expect(nfc("é")).toBe("é"); // NFC hợp nhất ký tự tổ hợp
  });

  it("compact bỏ khoảng trắng", () => {
    expect(compact("Ice Cream")).toBe("icecream");
  });

  it("lev", () => {
    expect(lev("", "abc")).toBe(3);
    expect(lev("kitten", "sitting")).toBe(3);
    expect(lev("same", "same")).toBe(0);
  });

  it("isNear: sai đúng 1 ký tự và đáp án >= 4 ký tự", () => {
    expect(isNear("recieve", "receive")).toBe(false); // hoán vị = 2 phép sửa
    expect(isNear("recive", "receive")).toBe(true);
    expect(isNear("apple", "apple")).toBe(false); // trùng hẳn: không phải "gần"
    expect(isNear("cta", "cat")).toBe(false);
    expect(isNear("cot", "cat")).toBe(false); // từ ngắn: là từ khác
    expect(isNear("aple", "apple")).toBe(true);
  });
});
