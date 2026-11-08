import type { ThemeTokens, TokenKey } from "./tokens";

/** Độ sáng tương đối theo WCAG 2.x. */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrastRatio(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export type ContrastRule = { fg: TokenKey; bg: TokenKey; min: number; why: string };

const TEXT = 4.5; // chữ thường
const UI = 3; // viền điều khiển, chữ lớn, thành phần đồ họa

/** Các cặp màu mà mọi theme PHẢI đạt. Thêm cặp mới ở đây là mọi theme được kiểm lại. */
export const CONTRAST_RULES: ContrastRule[] = [
  { fg: "text", bg: "bg", min: TEXT, why: "chữ trên nền trang" },
  { fg: "text", bg: "surface", min: TEXT, why: "chữ trên thẻ" },
  { fg: "text", bg: "accentSoft", min: TEXT, why: "chữ trên nền nhấn nhạt" },
  { fg: "textSoft", bg: "bg", min: TEXT, why: "chữ phụ trên nền trang" },
  { fg: "textSoft", bg: "surface", min: TEXT, why: "chữ phụ trên thẻ" },
  { fg: "textSoft", bg: "accentSoft", min: TEXT, why: "chữ phụ trên nền nhấn nhạt" },
  { fg: "textFaint", bg: "surface", min: UI, why: "chữ mờ (chữ lớn/trang trí) trên thẻ" },
  { fg: "textFaint", bg: "bg", min: UI, why: "chữ mờ (chữ lớn/trang trí) trên nền" },
  { fg: "accent", bg: "surface", min: TEXT, why: "liên kết, chữ nhấn trên thẻ" },
  { fg: "accent", bg: "bg", min: TEXT, why: "liên kết trên nền trang" },
  { fg: "accent", bg: "accentSoft", min: TEXT, why: "chip trên nền nhấn nhạt" },
  { fg: "onAccent", bg: "accent", min: TEXT, why: "chữ trên nút chính" },
  { fg: "onMark", bg: "mark", min: TEXT, why: "chữ trên đánh dấu" },
  { fg: "danger", bg: "surface", min: TEXT, why: "chữ nguy hiểm trên thẻ" },
  { fg: "danger", bg: "dangerSoft", min: TEXT, why: "chip nguy hiểm" },
  { fg: "onDanger", bg: "danger", min: TEXT, why: "chữ trên nút nguy hiểm" },
  { fg: "success", bg: "surface", min: TEXT, why: "chữ thành công trên thẻ" },
  { fg: "success", bg: "successSoft", min: TEXT, why: "chip thành công" },
  { fg: "onSuccess", bg: "success", min: TEXT, why: "chữ trên nút thành công" },
  { fg: "warning", bg: "surface", min: TEXT, why: "chữ cảnh báo trên thẻ" },
  { fg: "warning", bg: "warningSoft", min: TEXT, why: "chip cảnh báo" },
  { fg: "controlBorder", bg: "surface", min: UI, why: "viền ô nhập, nút, thẻ" },
  { fg: "accent", bg: "surface", min: UI, why: "viền/biểu tượng màu nhấn" },
  { fg: "rankGold", bg: "surface", min: UI, why: "số hạng 1 (chữ lớn)" },
  { fg: "rankSilver", bg: "surface", min: UI, why: "số hạng 2 (chữ lớn)" },
  { fg: "rankBronze", bg: "surface", min: UI, why: "số hạng 3 (chữ lớn)" },
];

export type ContrastResult = ContrastRule & { ratio: number; ok: boolean };

export function checkContrast(tokens: ThemeTokens): ContrastResult[] {
  return CONTRAST_RULES.map((r) => {
    const ratio = contrastRatio(tokens[r.fg], tokens[r.bg]);
    return { ...r, ratio, ok: ratio >= r.min };
  });
}
