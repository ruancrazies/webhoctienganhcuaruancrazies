import { defineScene } from "../types";

export default defineScene({
  id: "khai-giang",
  name: "Khai giảng",
  greeting: "Chào năm học mới! Cùng khởi động với những từ đầu tiên",
  tagline: "Rọi kính lúp vào ô mật khẩu để soi xem bạn đang gõ gì.",
  sort: 50,
  active: true, // lịch (đầu tháng 9) do admin đặt ở /admin/scenes/khai-giang
  tokens: {
    surface: "#fffefb", text: "#0e2a5c", textSoft: "#475a7c", accent: "#0d4aa8", accentSoft: "#e6effc", onAccent: "#ffffff", accentEdge: "#0a3377",
    border: "#d9e2f2", controlBorder: "#0d4aa8", margin: "#c2410c", mark: "#ffb020", danger: "#b3261e", dangerSoft: "#fdecea", success: "#1b6b3f", successSoft: "#e3f4ea",
    stageBg: "#0b3a85", stageBg2: "#1457b5", stageText: "#ffffff", stageTextSoft: "#e3efff", stageAccent: "#ffb020", glow: "#fff0a8",
  },
  canvas: {
    mascot: "walk",
    toolLabel: "Kính lúp",
    hint: "Kéo kính lúp, chạm vào chấm tròn để xoay, rồi chiếu vào ô mật khẩu.",
    ambient: true,
  },
});
