import type { Cefr } from "../../core/types";

/**
 * Phạm vi đã được phân giải (slug chủ đề → id). Repo chỉ làm việc với dạng này.
 * topicId có mặt → lọc theo chủ đề (bỏ qua `domain`, vì chủ đề đã xác định tập từ).
 */
export type ResolvedScope = { cefr: Cefr; domain: string | "all"; topicId?: number };
