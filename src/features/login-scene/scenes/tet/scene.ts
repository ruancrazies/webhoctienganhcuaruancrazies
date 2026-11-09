import { defineScene } from "../types";

export default defineScene({
  id: "tet",
  name: "Tết Nguyên đán",
  greeting: "Chúc mừng năm mới! Mỗi từ mới là một lộc đầu xuân",
  tagline: "Rọi bao lì xì vào ô mật khẩu để soi xem bạn đang gõ gì.",
  sort: 30,
  skin: "clay",
  active: true, // lịch (theo âm lịch) do admin đặt ở /admin/scenes/tet
  tokens: {
    surface: "#fffaf0", text: "#3a0d10", textSoft: "#6b3a3d", accent: "#b3202a", accentSoft: "#fdebe9", onAccent: "#ffffff", accentEdge: "#7a1219",
    border: "#ecd9cf", controlBorder: "#b3202a", margin: "#c8382e", mark: "#ffd24d", danger: "#a61e1e", dangerSoft: "#fdecea", success: "#1b6b3f", successSoft: "#e3f4ea",
    stageBg: "#6e0d14", stageBg2: "#a3202b", stageText: "#ffffff", stageTextSoft: "#ffe9c7", stageAccent: "#ffd24d", glow: "#ffe28a",
  },
  canvas: {
    mascot: "walk",
    toolLabel: "Bao lì xì",
    hint: "Kéo bao lì xì, chạm vào chấm tròn để xoay, rồi chiếu vào ô mật khẩu.",
    ambient: true,
  },
});
