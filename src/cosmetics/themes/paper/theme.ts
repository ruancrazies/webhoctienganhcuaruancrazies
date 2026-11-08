import { defineTheme } from "../../core/define";

/**
 * Vở ô ly: giấy ô li xanh, mực xanh, lề đỏ, bút đỏ chấm điểm. Theme mặc định, luôn mở.
 * So với bản CSS cũ, bốn màu được tối lại một chút để đạt tương phản 4.5:1 (cũ: 3.8–4.3):
 * danger/margin #d9453b → #c8382e, success #1b8458 → #177a52, textFaint #8a93ad → #6b7490.
 */
export default defineTheme({
  id: "paper",
  name: "Vở ô ly",
  group: "classic",
  scheme: "light",
  unlock: { type: "default" },
  sort: 0,
  pattern: "grid",
  tokens: {
    bg: "#f5f8fd",
    bgPattern: "#dfe7f5",
    surface: "#ffffff",
    text: "#121d4d",
    textSoft: "#5a6483",
    textFaint: "#6b7490",
    accent: "#1c2b6e",
    accentSoft: "#e8ecfa",
    onAccent: "#ffffff",
    accentEdge: "#121d4d",
    mark: "#ffe45c",
    onMark: "#121d4d",
    markEdge: "#c9aa00",
    border: "#cdd6ea",
    controlBorder: "#1c2b6e",
    margin: "#c8382e",
    danger: "#c8382e",
    dangerSoft: "#fdecea",
    onDanger: "#ffffff",
    dangerEdge: "#8f241c",
    success: "#177a52",
    successSoft: "#e5f6ee",
    onSuccess: "#ffffff",
    successEdge: "#0f5c3c",
    warning: "#9a5b00",
    warningSoft: "#fff4dc",
    rankGold: "#946a00",
    rankSilver: "#6b7280",
    rankBronze: "#a0522d",
  },
});
