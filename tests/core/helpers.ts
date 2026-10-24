import type { Cefr, GrammarQ, Sentence, Word } from "../../src/core/types";

/** Bộ ngẫu nhiên có hạt giống (mulberry32) để test lặp lại được. */
export function seeded(seed = 1): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const word = (id: number, en: string, vi: string, extra: Partial<Word> = {}): Word => ({
  id, key: `${en}:n:1`, en, pos: "n", vi, cefr: "A1" as Cefr, domain: "general", ...extra,
});

export const sentence = (id: number, en: string, vi?: string): Sentence => ({ id, en, vi });

export const grammarQ = (id: number, question: string, options: string[], answer: number, explanation?: string): GrammarQ => ({
  id, level: "A1", question, options, answer, explanation,
});

export const at = (iso: string) => new Date(iso);
