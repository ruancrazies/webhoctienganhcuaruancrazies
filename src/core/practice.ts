import type { GradedItem } from "./grading";
import { shuffle, type Rng } from "./questions";
import { PRACTICE_QUEST_MIN_ANSWERED } from "./rules";

/** Bốc ngẫu nhiên tối đa `n` phần tử khác nhau (không đổi mảng gốc). */
export function sample<T>(items: readonly T[], n: number, rng: Rng = Math.random): T[] {
  return shuffle([...items], rng).slice(0, Math.max(0, n));
}

/** Id các từ vựng làm SAI trong bài (mỗi từ một lần). Câu ngữ pháp không có wordId nên bị bỏ qua. */
export function wrongWordIds(graded: readonly GradedItem[]): number[] {
  const out = new Set<number>();
  for (const g of graded) {
    if (g.correct || g.item.part === "grammar") continue;
    if (typeof g.item.wordId === "number") out.add(g.item.wordId);
  }
  return [...out];
}

const isAnswered = (g: GradedItem): boolean => {
  const v = g.answer?.value;
  return Array.isArray(v) ? v.some((x) => x.trim() !== "") : typeof v === "string" && v.trim() !== "";
};

/** Đã làm đủ nghiêm túc để tính vào nhiệm vụ ngày: trả lời ≥ một nửa số câu của đề. */
export function answeredEnough(graded: readonly GradedItem[]): boolean {
  if (graded.length === 0) return false;
  return graded.filter(isAnswered).length >= Math.ceil(graded.length * PRACTICE_QUEST_MIN_ANSWERED);
}
