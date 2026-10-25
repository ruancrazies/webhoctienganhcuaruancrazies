import { passageIdsOf, revealPassage, toClientPassage } from "../../core/passages";
import type { Cefr, ClientPassage, PassageBundle, RevealedPassage, StoredItem } from "../../core/types";
import type { ExamConfig } from "../../core/exam";
import { passagesByIds, pickPassages } from "../repo";

/**
 * Bốc đoạn đọc / nghe cho một đề. Lỗi đọc DB (ví dụ chưa chạy migration 0009) KHÔNG làm hỏng cả bài kiểm tra:
 * đề vẫn ra, chỉ thiếu phần đọc/nghe, và lỗi được ghi log để bạn thấy.
 */
export async function pickPassageBundles(level: Cefr, cfg: ExamConfig, rng: () => number): Promise<PassageBundle[]> {
  const want = cfg.passages ?? { reading: 0, listening: 0 };
  try {
    const [reading, listening] = await Promise.all([pickPassages("reading", level, want.reading, rng), pickPassages("listening", level, want.listening, rng)]);
    return [...reading, ...listening];
  } catch (e) {
    console.error("[passages] không bốc được bài đọc/nghe, đề sẽ không có phần này:", e);
    return [];
  }
}

/** Các đoạn của đề đang làm (thứ tự theo lần xuất hiện đầu tiên trong đề). */
async function passagesOf(items: StoredItem[]) {
  const ids = passageIdsOf(items);
  const found = new Map((await passagesByIds(ids)).map((p) => [p.id, p]));
  return ids.map((id) => found.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
}

/** Gửi xuống trình duyệt khi đang làm bài (bài nghe không lộ lời thoại ra giao diện). */
export async function clientPassagesFor(items: StoredItem[]): Promise<ClientPassage[]> {
  return (await passagesOf(items)).map(toClientPassage);
}

/** Gửi sau khi nộp bài: đoạn đầy đủ, kể cả lời thoại bài nghe. */
export async function revealedPassagesFor(items: StoredItem[]): Promise<RevealedPassage[]> {
  return (await passagesOf(items)).map(revealPassage);
}
