import { describe, expect, it } from "vitest";
import { ALL_QUESTS, BASE_QUESTS, BONUS_QUEST, buildQuestViews, isQuestId, roundQuestDelta } from "../../src/core/quests";

const lv = (level: number) => ({ level });

describe("định nghĩa nhiệm vụ", () => {
  it("đúng số liệu chủ dự án chốt", () => {
    expect(BASE_QUESTS.map((q) => [q.id, q.target, q.reward])).toEqual([
      ["learn", 20, 60],
      ["review", 20, 60],
      ["play", 1, 80],
      ["test", 1, 150],
    ]);
    expect(BONUS_QUEST).toMatchObject({ id: "all", reward: 300, target: 4 });
  });

  it("id duy nhất; isQuestId chỉ nhận id hợp lệ", () => {
    expect(new Set(ALL_QUESTS.map((q) => q.id)).size).toBe(ALL_QUESTS.length);
    expect(isQuestId("learn")).toBe(true);
    expect(isQuestId("all")).toBe(true);
    expect(isQuestId("test")).toBe(true);
    expect(isQuestId("nope")).toBe(false);
    expect(isQuestId(undefined)).toBe(false);
  });
});

describe("roundQuestDelta", () => {
  it("luôn tính 1 lượt chơi, kể cả trò không SRS (danh sách rỗng)", () => {
    expect(roundQuestDelta([])).toEqual({ learn: 0, review: 0, play: 1, test: 0 });
  });

  it("từ chưa có tiến độ mà trả lời đúng (level ≥ 1) → từ mới", () => {
    expect(roundQuestDelta([{ before: null, after: lv(1) }])).toEqual({ learn: 1, review: 0, play: 1, test: 0 });
  });

  it("từ mới trả lời sai (vẫn level 0) → không tính gì", () => {
    expect(roundQuestDelta([{ before: null, after: lv(0) }])).toEqual({ learn: 0, review: 0, play: 1, test: 0 });
  });

  it("từ đang level 0 rồi trả lời đúng → tính là học từ mới", () => {
    expect(roundQuestDelta([{ before: lv(0), after: lv(1) }])).toEqual({ learn: 1, review: 0, play: 1, test: 0 });
  });

  it("từ đã có level ≥ 1 → ôn từ cũ, đúng hay sai đều tính", () => {
    const r = roundQuestDelta([
      { before: lv(1), after: lv(2) },
      { before: lv(2), after: lv(0) }, // sai, rớt về 0 nhưng vẫn là một lần ôn
      { before: lv(4), after: lv(5) },
    ]);
    expect(r).toEqual({ learn: 0, review: 3, play: 1, test: 0 });
  });

  it("hỗn hợp", () => {
    const r = roundQuestDelta([
      { before: null, after: lv(1) },
      { before: null, after: lv(0) },
      { before: lv(3), after: lv(4) },
    ]);
    expect(r).toEqual({ learn: 1, review: 1, play: 1, test: 0 });
  });
});

describe("buildQuestViews", () => {
  it("chưa có dòng nào → tiến độ 0 theo định nghĩa hiện hành", () => {
    const { quests, bonus } = buildQuestViews([]);
    expect(quests.map((q) => [q.id, q.progress, q.target, q.reward, q.done, q.claimed])).toEqual([
      ["learn", 0, 20, 60, false, false],
      ["review", 0, 20, 60, false, false],
      ["play", 0, 1, 80, false, false],
      ["test", 0, 1, 150, false, false],
    ]);
    expect(bonus).toMatchObject({ id: "all", progress: 0, target: 4, reward: 300, done: false });
  });

  it("dùng mục tiêu/thưởng đã chốt trong dòng, tiến độ không vượt mục tiêu", () => {
    const { quests, bonus } = buildQuestViews([
      { quest: "learn", progress: 99, target: 10, reward: 25, claimed: false },
      { quest: "play", progress: 1, target: 1, reward: 80, claimed: true },
      { quest: "all", progress: 1, target: 3, reward: 300, claimed: false },
    ]);
    expect(quests[0]).toMatchObject({ progress: 10, target: 10, reward: 25, done: true, claimed: false });
    expect(quests[2]).toMatchObject({ done: true, claimed: true });
    expect(quests[3]).toMatchObject({ id: "test", progress: 0, done: false });
    expect(bonus).toMatchObject({ progress: 1, done: false });
  });
});
