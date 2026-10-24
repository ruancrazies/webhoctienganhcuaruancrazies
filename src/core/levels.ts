import { CEFR_ORDER, GATED_LEVELS, type Cefr, type LevelCounters, type LevelStatus } from "./types";

export type LevelsConfig = {
  /** Số từ general đã học, CỘNG DỒN từ A1, tối thiểu để được thi cấp đó (levels.yml). */
  examMinWords: Partial<Record<Cefr, number>>;
};

/**
 * Trạng thái các cấp (mục 4.3, 5.3). Nguồn quyết định "qua cấp" DUY NHẤT là `passes` (level_passes).
 *  - A1 luôn mở; cấp N mở khi mọi cấp trước đã qua → không thi nhảy cấp.
 *  - Được vào thi khi đang mở, chưa qua, và tổng từ general đã học (cộng dồn) >= ngưỡng.
 *    Ngưỡng tự hạ xuống tổng số từ general active (cộng dồn) nếu nội dung chưa đủ, để không bị kẹt.
 *  - C2 không có bài thi: mở sau khi qua C1, không bao giờ `eligible`.
 * `counters` chỉ gồm từ lĩnh vực general. Cấp thiếu trong `counters` coi như 0.
 */
export function levelStatus(counters: LevelCounters[], passes: ReadonlySet<Cefr>, cfg: LevelsConfig): LevelStatus[] {
  const byCefr = new Map(counters.map((c) => [c.cefr, c]));
  let open = true;
  let learnedCum = 0;
  let totalCum = 0;
  const out: LevelStatus[] = [];

  for (const cefr of CEFR_ORDER) {
    const gated = (GATED_LEVELS as readonly Cefr[]).includes(cefr);
    const c = byCefr.get(cefr);
    learnedCum += c?.learned ?? 0;
    totalCum += c?.total ?? 0;

    const pass = gated && passes.has(cefr);
    const unlocked = open;
    const needLearned = gated ? Math.min(cfg.examMinWords[cefr] ?? 0, totalCum) : 0;
    const eligible = gated && unlocked && !pass && totalCum > 0 && learnedCum >= needLearned;
    out.push({ cefr, pass, unlocked, eligible, learnedCum, needLearned });

    open = open && pass;
  }
  return out;
}

export function statusOf(statuses: LevelStatus[], cefr: Cefr): LevelStatus {
  const s = statuses.find((x) => x.cefr === cefr);
  if (!s) throw new Error(`Cấp không hợp lệ: ${cefr}`);
  return s;
}

/** Cấp cao nhất đã qua LIÊN TIẾP từ A1 (hiển thị ở bảng xếp hạng); null nếu chưa qua cấp nào. */
export function highestPassedLevel(passes: ReadonlySet<Cefr>): Cefr | null {
  let best: Cefr | null = null;
  for (const cefr of GATED_LEVELS) {
    if (!passes.has(cefr)) break;
    best = cefr;
  }
  return best;
}
