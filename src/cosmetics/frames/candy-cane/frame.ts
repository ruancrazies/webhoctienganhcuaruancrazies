import { defineFrame } from "../../core/define";

/** ẢNH MẪU (placeholder do mã vẽ, không phải tranh của họa sĩ): thay public/frames/candy-cane/96.webp + 192.webp bằng bản của họa sĩ rồi mới bật `active`. */
export default defineFrame({
  id: "candy-cane",
  name: "Vòng kẹo gậy",
  rarity: "rare",
  unlock: { type: "event", event: "giang-sinh-2026" },
  durationDays: 30, // có hạn: hết 30 ngày tự về không khung, nhận lại ở đợt sau
  active: false,
});
