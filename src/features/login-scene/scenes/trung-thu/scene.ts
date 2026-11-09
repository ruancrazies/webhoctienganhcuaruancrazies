import { defineScene } from "../types";

export default defineScene({
  id: "trung-thu",
  name: "Trung thu",
  greeting: "Trung thu vui vẻ! Rước đèn học từ mới dưới ánh trăng",
  tagline: "Rọi lồng đèn vào ô mật khẩu để soi xem bạn đang gõ gì.",
  sort: 40,
  skin: "clay",
  active: true, // lịch (theo âm lịch) do admin đặt ở /admin/scenes/trung-thu
  tokens: {
    surface: "#fffdf5", text: "#10204a", textSoft: "#4a5878", accent: "#1c3a7a", accentSoft: "#e8eefb", onAccent: "#ffffff", accentEdge: "#10204a",
    border: "#e3dcc4", controlBorder: "#1c3a7a", margin: "#b45309", mark: "#ffd86b", danger: "#b3261e", dangerSoft: "#fdecea", success: "#1b6b3f", successSoft: "#e3f4ea",
    stageBg: "#0b1d4a", stageBg2: "#1d3b80", stageText: "#fff8e1", stageTextSoft: "#dbe6ff", stageAccent: "#ffd86b", glow: "#ffe08a",
  },
  canvas: {
    mascot: "walk",
    toolLabel: "Lồng đèn",
    hint: "Kéo lồng đèn, chạm vào chấm tròn để xoay, rồi chiếu vào ô mật khẩu.",
    ambient: true,
  },
});
