import { defineScene } from "../types";

export default defineScene({
  id: "giang-sinh",
  name: "Giáng sinh",
  greeting: "Giáng sinh an lành! Mỗi từ mới là một món quà nhỏ",
  tagline: "Rọi ngôi sao vào ô mật khẩu để soi xem bạn đang gõ gì.",
  sort: 20,
  tokens: {
    surface: "#fffdf7", text: "#1a2b23", textSoft: "#4a5d54", accent: "#a61e1e", accentSoft: "#fbe9e7", onAccent: "#ffffff", accentEdge: "#701212",
    border: "#e6dccb", controlBorder: "#a61e1e", margin: "#c8382e", mark: "#ffd66b", danger: "#a61e1e", dangerSoft: "#fdecea", success: "#1b6b3f", successSoft: "#e3f4ea",
    stageBg: "#0f3b2e", stageBg2: "#1b5e47", stageText: "#ffffff", stageTextSoft: "#d6efe3", stageAccent: "#ff9488", glow: "#ffe9a8",
  },
  canvas: {
    mascot: "walk",
    toolLabel: "Ngôi sao",
    hint: "Kéo ngôi sao, chạm vào chấm tròn để xoay, rồi chiếu vào ô mật khẩu.",
    ambient: true,
  },
});
