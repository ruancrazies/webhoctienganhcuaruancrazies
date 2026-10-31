import { shuffle, type Rng } from "./questions";
import type { ClientPassage, Passage, PassageBundle, PassageQ, RevealedPassage, StoredItem } from "./types";

/** Hai lựa chọn của câu đúng/sai (tf). Thứ tự cố định: answer 1 = đúng, 2 = sai. */
export const TF_OPTIONS = ["Đúng", "Sai"] as const;

const isUrl = (s: string) => /^https?:\/\//i.test(s) || s.startsWith("/");

/** Một câu hỏi của đoạn văn → StoredItem (game "passage", part = reading | listening). */
export function passageItem(passage: Passage, q: PassageQ, rng: Rng): StoredItem {
  const options = q.kind === "tf" ? [...TF_OPTIONS] : shuffle(q.options, rng);
  const expected = q.kind === "tf" ? TF_OPTIONS[q.answer - 1] : q.options[q.answer - 1];
  return {
    qid: "",
    game: "passage",
    prompt: q.question,
    expected,
    options,
    passageId: passage.id,
    passageQuestionId: q.id,
    part: passage.skill,
    explanation: q.explanation ?? undefined,
  };
}

/**
 * Các câu hỏi của những đoạn được chọn: bài đọc trước, bài nghe sau; các câu của MỘT đoạn nằm liền nhau theo `sort`
 * (không xáo trộn với từ vựng / ngữ pháp để người học không phải cuộn qua lại giữa các đoạn).
 */
export function passageItems(bundles: readonly PassageBundle[], rng: Rng = Math.random): StoredItem[] {
  const order = { reading: 0, listening: 1 } as const;
  return [...bundles]
    .sort((a, b) => order[a.passage.skill] - order[b.passage.skill])
    .flatMap((b) => [...b.questions].sort((x, y) => x.sort - y.sort).map((q) => passageItem(b.passage, q, rng)));
}

/** Phần gửi xuống trình duyệt khi đang làm bài. Bài nghe không lộ lời thoại ra giao diện. */
export function toClientPassage(p: Passage): ClientPassage {
  if (p.skill === "reading") return { id: p.id, skill: p.skill, title: p.title, text: p.body };
  const audio = p.audio?.trim();
  return audio && isUrl(audio)
    ? { id: p.id, skill: p.skill, title: p.title, audioUrl: audio }
    : { id: p.id, skill: p.skill, title: p.title, speech: p.body };
}

export const revealPassage = (p: Passage): RevealedPassage => ({ id: p.id, skill: p.skill, title: p.title, body: p.body });

/** Id các đoạn văn có trong đề (không trùng, giữ thứ tự xuất hiện). */
export function passageIdsOf(items: readonly StoredItem[]): number[] {
  return [...new Set(items.map((i) => i.passageId).filter((x): x is number => typeof x === "number"))];
}
