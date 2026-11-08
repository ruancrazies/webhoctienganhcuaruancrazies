import { contrastRatio } from "../../cosmetics/core/contrast";
import type { SceneTokens } from "./scenes/types";

type Rule = { fg: keyof SceneTokens; bg: keyof SceneTokens; min: number; why: string };
const TEXT = 4.5;
const UI = 3;

/** Cặp màu mà mọi scene PHẢI đạt. Thẻ đăng nhập luôn nền đặc nên chữ và ô nhập đạt mức này dù sân khấu rực rỡ đến đâu. */
export const SCENE_CONTRAST_RULES: Rule[] = [
  { fg: "text", bg: "surface", min: TEXT, why: "chữ trên thẻ đăng nhập" },
  { fg: "textSoft", bg: "surface", min: TEXT, why: "chữ phụ trên thẻ" },
  { fg: "accent", bg: "surface", min: TEXT, why: "liên kết trên thẻ" },
  { fg: "onAccent", bg: "accent", min: TEXT, why: "chữ trên nút đăng nhập" },
  { fg: "controlBorder", bg: "surface", min: UI, why: "viền ô nhập" },
  { fg: "accent", bg: "surface", min: UI, why: "viền khung focus" },
  { fg: "danger", bg: "surface", min: TEXT, why: "chữ lỗi trên thẻ" },
  { fg: "danger", bg: "dangerSoft", min: TEXT, why: "thông báo lỗi" },
  { fg: "success", bg: "successSoft", min: TEXT, why: "thông báo thành công" },
  { fg: "text", bg: "successSoft", min: TEXT, why: "ghi chú" },
  { fg: "stageText", bg: "stageBg", min: TEXT, why: "câu chào (đầu gradient)" },
  { fg: "stageText", bg: "stageBg2", min: TEXT, why: "câu chào (cuối gradient)" },
  { fg: "stageTextSoft", bg: "stageBg", min: TEXT, why: "dòng phụ (đầu gradient)" },
  { fg: "stageTextSoft", bg: "stageBg2", min: TEXT, why: "dòng phụ (cuối gradient)" },
  { fg: "stageAccent", bg: "stageBg", min: UI, why: "viền focus của công cụ (đầu gradient)" },
  { fg: "stageAccent", bg: "stageBg2", min: UI, why: "viền focus của công cụ (cuối gradient)" },
];

export type SceneContrastResult = Rule & { ratio: number; ok: boolean };

export function checkSceneContrast(t: SceneTokens): SceneContrastResult[] {
  return SCENE_CONTRAST_RULES.map((r) => {
    const ratio = contrastRatio(t[r.fg], t[r.bg]);
    return { ...r, ratio, ok: ratio >= r.min };
  });
}
