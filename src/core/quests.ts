import type { SrsState } from "./types";

/**
 * Nhiệm vụ hằng ngày (reset 00:00 giờ Việt Nam, cùng `dayNo` với chuỗi ngày).
 * Chỉnh mục tiêu / thưởng ở đây: số được CHỐT vào DB lúc nhiệm vụ của ngày đó được tạo,
 * nên đổi ở đây chỉ có hiệu lực từ ngày mới (không làm lệch nhiệm vụ đang làm dở).
 *
 * Thưởng nhận bằng nút "Nhận thưởng" và cộng thẳng vào tổng XP — KHÔNG tính vào DAILY_XP_CAP
 * (giới hạn đó chỉ áp cho XP từ trò chơi), nên người đã chạm trần vẫn nhận được thưởng nhiệm vụ.
 */

export type QuestId = "learn" | "review" | "play" | "all";

export type QuestDef = { id: QuestId; title: string; target: number; reward: number };

/** Ba nhiệm vụ cơ bản. */
export const BASE_QUESTS: readonly QuestDef[] = [
  { id: "learn", title: "Học 20 từ mới", target: 20, reward: 60 },
  { id: "review", title: "Ôn 20 từ cũ", target: 20, reward: 60 },
  { id: "play", title: "Chơi một trò chơi bất kỳ", target: 1, reward: 80 },
];

/** Thưởng khi hoàn thành cả ba nhiệm vụ cơ bản (không cần nhận thưởng từng cái trước). `target` = số nhiệm vụ cơ bản. */
export const BONUS_QUEST: QuestDef = { id: "all", title: "Hoàn thành tất cả nhiệm vụ", target: BASE_QUESTS.length, reward: 300 };

export const ALL_QUESTS: readonly QuestDef[] = [...BASE_QUESTS, BONUS_QUEST];

export function isQuestId(x: unknown): x is QuestId {
  return typeof x === "string" && ALL_QUESTS.some((q) => q.id === x);
}

/** Số tăng tiến độ sau một sự kiện (vòng chơi / lần bấm "Đã học"). */
export type QuestDelta = { learn: number; review: number; play: number };

type Step = { before: Pick<SrsState, "level"> | null; after: Pick<SrsState, "level"> };

/**
 * Tiến độ nhiệm vụ của MỘT vòng chơi, tính từ kết quả SRS từng từ (mỗi từ một lần):
 *  - learn : từ chưa có tiến độ (hoặc level 0) mà sau vòng đã lên level ≥ 1 (trả lời đúng).
 *  - review: từ đã có tiến độ level ≥ 1 trước vòng — đã trả lời (đúng hay sai) tức là đã ôn.
 *  - play  : luôn 1 (vòng được ghi nhận thành công mới gọi hàm này).
 * Trò không SRS (match, flash, …) truyền danh sách rỗng → chỉ tính `play`.
 */
export function roundQuestDelta(steps: Iterable<Step>): QuestDelta {
  let learn = 0;
  let review = 0;
  for (const s of steps) {
    const wasKnown = s.before !== null && s.before.level >= 1;
    if (wasKnown) review++;
    else if (s.after.level >= 1) learn++;
  }
  return { learn, review, play: 1 };
}

// ---------- hiển thị ----------

export type QuestRow = { quest: string; progress: number; target: number; reward: number; claimed: boolean };

export type QuestView = {
  id: QuestId;
  title: string;
  progress: number;
  target: number;
  reward: number;
  /** Đủ tiến độ, có thể nhận. */
  done: boolean;
  claimed: boolean;
};

/**
 * Ghép định nghĩa với dòng trong DB. Chưa có dòng (ngày mới, chưa làm gì) → tiến độ 0 theo định nghĩa hiện hành;
 * có dòng → dùng mục tiêu/thưởng đã chốt trong dòng đó.
 */
export function buildQuestViews(rows: readonly QuestRow[]): { quests: QuestView[]; bonus: QuestView } {
  const byId = new Map(rows.map((r) => [r.quest, r]));
  const view = (d: QuestDef): QuestView => {
    const r = byId.get(d.id);
    const target = r?.target ?? d.target;
    const progress = Math.min(r?.progress ?? 0, target);
    return { id: d.id, title: d.title, progress, target, reward: r?.reward ?? d.reward, done: progress >= target, claimed: r?.claimed ?? false };
  };
  return { quests: BASE_QUESTS.map(view), bonus: view(BONUS_QUEST) };
}
