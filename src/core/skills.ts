import type { GameId } from "./types";

/**
 * Kỹ năng suy ra từ loại game (thiết kế mục 6.1). Hàm thuần, không phụ thuộc DB/HTTP.
 *
 *   meaning   Nhận diện nghĩa     quiz, blitz, match, flash
 *   recall    Nhớ và chính tả     type, scramble
 *   context   Dùng trong ngữ cảnh cloze
 *   listening Nghe                listen, bài nghe trong passage
 *   grammar   Ngữ pháp            tf, build, grammar (câu ngữ pháp của bài thi)
 *   reading   Đọc hiểu            bài đọc trong passage
 */
export type Skill = "meaning" | "recall" | "context" | "listening" | "grammar" | "reading";

export const SKILLS: readonly Skill[] = ["meaning", "recall", "context", "listening", "grammar", "reading"];

export const SKILL_LABEL: Record<Skill, string> = {
  meaning: "Nhận diện nghĩa",
  recall: "Nhớ và chính tả",
  context: "Dùng trong ngữ cảnh",
  listening: "Nghe",
  grammar: "Ngữ pháp",
  reading: "Đọc hiểu",
};

const GAME_SKILL: Partial<Record<string, Skill>> = {
  quiz: "meaning",
  blitz: "meaning",
  match: "meaning",
  flash: "meaning",
  type: "recall",
  scramble: "recall",
  cloze: "context",
  listen: "listening",
  tf: "grammar",
  build: "grammar",
  grammar: "grammar",
};

/**
 * Kỹ năng của một câu đã trả lời. `game` và `part` đúng như cột của answer_events.
 * Câu bài đọc/nghe (game = "passage") theo `part`. Trả null nếu không suy ra được (game lạ) — bỏ qua, không đoán.
 */
export function skillOf(game: string, part?: string | null): Skill | null {
  if (game === "passage") return part === "listening" ? "listening" : part === "reading" ? "reading" : null;
  const s = GAME_SKILL[game];
  if (s) return s;
  // Bài thi/kiểm tra: câu từ vựng ghi game = quiz/type/…; nếu part đã rõ thì dùng làm dự phòng.
  if (part === "grammar") return "grammar";
  if (part === "reading") return "reading";
  if (part === "listening") return "listening";
  return null;
}

/**
 * Game nên chơi để luyện từng kỹ năng. null = chưa có trò riêng (đọc hiểu → trang Kiểm tra, có bài đọc).
 * Nghe dùng `listen` (nghe từ), vì bài nghe dài chỉ có trong bài kiểm tra.
 */
export const SKILL_GAME: Record<Skill, GameId | null> = {
  meaning: "quiz",
  recall: "type",
  context: "cloze",
  listening: "listen",
  grammar: "tf",
  reading: null,
};
