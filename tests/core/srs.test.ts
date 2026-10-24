import { describe, expect, it } from "vitest";
import { isDue, learnState, markLearnedState, nextSrsState } from "../../src/core/srs";
import type { SrsState } from "../../src/core/types";
import { at } from "./helpers";

const now = at("2026-10-24T03:00:00Z");
const DAY = 86_400_000;
const st = (level: number, bad = 0): SrsState => ({ level, bad, nextReview: now });
const days = (s: SrsState) => (s.nextReview.getTime() - now.getTime()) / DAY;

describe("nextSrsState — đúng", () => {
  it("từ mới trả lời đúng → level 1, đến hạn ngay", () => {
    const s = nextSrsState(null, true, now);
    expect(s).toMatchObject({ level: 1, bad: 0 });
    expect(days(s)).toBe(0);
  });

  it("đúng liên tiếp: level 1→2→3→4→5, khoảng ôn theo level MỚI [0,0,0,4,7,14]", () => {
    let s: SrsState | null = null;
    const got: [number, number][] = [];
    for (let i = 0; i < 5; i++) {
      s = nextSrsState(s, true, now);
      got.push([s.level, days(s)]);
    }
    expect(got).toEqual([[1, 0], [2, 0], [3, 4], [4, 7], [5, 14]]);
  });

  it("đã level 5 vẫn đúng thì giữ 5 và chờ 14 ngày", () => {
    const s = nextSrsState(st(5), true, now);
    expect(s.level).toBe(5);
    expect(days(s)).toBe(14);
  });

  it("đúng thì reset bad về 0", () => {
    expect(nextSrsState(st(4, 2), true, now).bad).toBe(0);
  });
});

describe("nextSrsState — sai", () => {
  it.each([0, 1, 2])("chưa thuộc (level %i) sai → level 0, hỏi lại ngay", (level) => {
    const s = nextSrsState(st(level), false, now);
    expect(s).toMatchObject({ level: 0, bad: 0 });
    expect(days(s)).toBe(0);
  });

  it("từ mới (chưa có dòng) trả lời sai → level 0", () => {
    expect(nextSrsState(null, false, now)).toMatchObject({ level: 0, bad: 0 });
  });

  it("đã thuộc mà sai một hai lần: vẫn giữ thuộc, bad tăng, hỏi lại ngay", () => {
    let s = nextSrsState(st(4), false, now);
    expect(s).toMatchObject({ level: 4, bad: 1 });
    expect(days(s)).toBe(0);
    s = nextSrsState(s, false, now);
    expect(s).toMatchObject({ level: 4, bad: 2 });
  });

  it("đã thuộc, sai 3 lần liên tiếp mới quên (level 0, bad 0)", () => {
    let s: SrsState = st(3);
    for (let i = 0; i < 3; i++) s = nextSrsState(s, false, now);
    expect(s).toMatchObject({ level: 0, bad: 0 });
  });

  it("đã thuộc: sai rồi đúng thì chuỗi sai bị ngắt", () => {
    let s: SrsState = st(3);
    s = nextSrsState(s, false, now);
    s = nextSrsState(s, false, now);
    s = nextSrsState(s, true, now);
    expect(s).toMatchObject({ level: 4, bad: 0 });
    s = nextSrsState(s, false, now);
    expect(s.bad).toBe(1);
  });

  it("không sửa trạng thái đầu vào", () => {
    const cur = st(3, 1);
    nextSrsState(cur, false, now);
    expect(cur).toEqual(st(3, 1));
  });
});

describe("trạng thái hiển thị và chế độ Học", () => {
  it("learnState", () => {
    expect(learnState(null)).toBe("new");
    expect(learnState({ level: 0 })).toBe("due");
    expect(learnState({ level: 1 })).toBe("learned");
    expect(learnState({ level: 2 })).toBe("learned");
    expect(learnState({ level: 3 })).toBe("mastered");
    expect(learnState({ level: 5 })).toBe("mastered");
  });

  it("markLearnedState: chỉ từ mới / level 0 lên level 1; không bao giờ lên 'thuộc'", () => {
    expect(markLearnedState(null, now)).toEqual({ level: 1, bad: 0, nextReview: now });
    expect(markLearnedState(st(0, 0), now)?.level).toBe(1);
    expect(markLearnedState(st(1), now)).toBeNull();
    expect(markLearnedState(st(4, 2), now)).toBeNull();
  });

  it("isDue", () => {
    expect(isDue(st(1), now)).toBe(true);
    expect(isDue({ ...st(3), nextReview: new Date(now.getTime() + DAY) }, now)).toBe(false);
  });
});
