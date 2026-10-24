import { levelStatus, statusOf } from "../../core/levels";
import type { Cefr, LevelStatus } from "../../core/types";
import { getConfig } from "../config";
import { ServiceError } from "../errors";
import { levelCounters, levelPasses } from "../repo";

/** Trạng thái mọi cấp của một người: chỉ đọc bộ đếm có sẵn và level_passes (không quét bảng từ). */
export async function getLevelStatuses(userId: string): Promise<LevelStatus[]> {
  const [counters, passes] = await Promise.all([levelCounters(userId), levelPasses(userId)]);
  return levelStatus(counters, passes, getConfig().levels);
}

/** Ném 403 nếu cấp đang khóa; trả trạng thái của cấp đó nếu đã mở. */
export async function requireUnlocked(userId: string, cefr: Cefr): Promise<LevelStatus> {
  const s = statusOf(await getLevelStatuses(userId), cefr);
  if (!s.unlocked) throw new ServiceError(403, "LEVEL_LOCKED", "Cấp đang khóa: hãy qua bài kiểm tra của cấp trước", { cefr });
  return s;
}
