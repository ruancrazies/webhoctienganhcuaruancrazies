import { GAME_RULES } from "../core/rules";
import type { GameId } from "../core/types";

/**
 * Danh sách 10 trò (mục 4.1). Dữ liệu thuần: dùng được cả ở server component lẫn client.
 * `ready` = trang chơi đã có. Cả 10 trò đã có (games/<id>.tsx, khung chung ở games/shell).
 */
export type GameMeta = {
  id: GameId;
  name: string;
  emoji: string;
  blurb: string;
  ready: boolean;
  levelOnly: boolean;
  xp: number;
  /** Có cập nhật SRS (ôn từ theo lịch) không. */
  srs: boolean;
};

const base: Omit<GameMeta, "levelOnly" | "xp" | "srs">[] = [
  { id: "quiz", name: "Trắc nghiệm", emoji: "✅", blurb: "Chọn nghĩa tiếng Việt đúng của từ", ready: true },
  { id: "blitz", name: "Đua tốc độ", emoji: "⚡", blurb: "60 giây, 3 mạng, combo nhân điểm", ready: true },
  { id: "type", name: "Gõ từ", emoji: "⌨️", blurb: "Nhìn nghĩa, gõ từ tiếng Anh", ready: true },
  { id: "scramble", name: "Xếp chữ cái", emoji: "🔤", blurb: "Sắp lại các chữ cái thành từ đúng", ready: true },
  { id: "cloze", name: "Điền vào câu", emoji: "📝", blurb: "Điền từ còn thiếu trong câu thật", ready: true },
  { id: "listen", name: "Nghe và chọn", emoji: "🎧", blurb: "Nghe phát âm, chọn nghĩa đúng", ready: true },
  { id: "match", name: "Ghép cặp", emoji: "🧩", blurb: "Nối từ tiếng Anh với nghĩa", ready: true },
  { id: "flash", name: "Thẻ ghi nhớ", emoji: "🗂️", blurb: "Lật thẻ, tự đánh giá mình nhớ chưa", ready: true },
  { id: "build", name: "Xếp câu", emoji: "🧱", blurb: "Sắp các từ thành câu hoàn chỉnh", ready: true },
  { id: "tf", name: "Đúng hay sai", emoji: "⚖️", blurb: "Câu ngữ pháp này đúng hay sai?", ready: true },
];

export const GAMES: GameMeta[] = base.map((g) => ({
  ...g,
  levelOnly: !!GAME_RULES[g.id].levelOnly,
  xp: GAME_RULES[g.id].xp,
  srs: GAME_RULES[g.id].srs,
}));

export const gameById = (id: string): GameMeta | undefined => GAMES.find((g) => g.id === id);

/** Đường dẫn trang chơi cho một phạm vi. */
export function playHref(game: GameId, scope: { cefr: string; domain?: string; topic?: string }): string {
  const q = new URLSearchParams({ cefr: scope.cefr });
  if (scope.topic) q.set("topic", scope.topic);
  else q.set("domain", scope.domain ?? "all");
  return `/play/${game}?${q.toString()}`;
}

/** Đường dẫn trang học cho một phạm vi. */
export function learnHref(scope: { cefr: string; domain?: string; topic?: string }): string {
  const q = new URLSearchParams();
  if (scope.topic) q.set("topic", scope.topic);
  else q.set("domain", scope.domain ?? "all");
  return `/learn/${scope.cefr}?${q.toString()}`;
}
