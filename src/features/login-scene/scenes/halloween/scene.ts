import { defineScene } from "../types";

export default defineScene({
  id: "halloween",
  name: "Halloween",
  greeting: "Halloween vui vẻ! Từ mới đang trốn trong bóng tối",
  tagline: "Rọi đèn pin vào ô mật khẩu để soi xem bạn đang gõ gì.",
  sort: 10,
  skin: "neo",
  tokens: {
    surface: "#fffaf0", text: "#2b1240", textSoft: "#5a4570", accent: "#5b21a6", accentSoft: "#efe4fb", onAccent: "#ffffff", accentEdge: "#3b1470",
    border: "#e3d6f0", controlBorder: "#5b21a6", margin: "#c2410c", mark: "#ffb24a", danger: "#b3261e", dangerSoft: "#fdecea", success: "#1b6b3f", successSoft: "#e3f4ea",
    stageBg: "#1d0f33", stageBg2: "#3a1a5e", stageText: "#fff3e0", stageTextSoft: "#e6d6f7", stageAccent: "#ff9a3c", glow: "#ffc266",
  },
  canvas: {
    mascot: "hang",
    toolLabel: "Đèn pin",
    hint: "Kéo đèn pin, chạm vào chấm tròn để xoay, rồi chiếu vào ô mật khẩu.",
    ambient: true,
  },
});
