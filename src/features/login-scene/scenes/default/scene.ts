import paper from "../../../../cosmetics/themes/paper/theme";
import { defineScene } from "../types";

/** Mặc định: đúng vở ô ly của app, không hiệu ứng. Luôn có, kể cả khi DB lỗi hay scene khác hỏng. */
const t = paper.tokens;
export default defineScene({
  id: "default",
  name: "Mặc định (vở ô ly)",
  greeting: "Học từ vựng mỗi ngày, một chút thôi cũng tiến bộ",
  tagline: "Vào lại là học tiếp, chuỗi ngày đang chờ bạn.",
  sort: 0,
  tokens: {
    surface: t.surface, text: t.text, textSoft: t.textSoft, accent: t.accent, accentSoft: t.accentSoft, onAccent: t.onAccent, accentEdge: t.accentEdge,
    border: t.border, controlBorder: t.controlBorder, margin: t.margin, mark: t.mark, danger: t.danger, dangerSoft: t.dangerSoft, success: t.success, successSoft: t.successSoft,
    stageBg: t.bg, stageBg2: t.accentSoft, stageText: t.text, stageTextSoft: t.textSoft, stageAccent: t.accent, glow: t.mark,
  },
});
