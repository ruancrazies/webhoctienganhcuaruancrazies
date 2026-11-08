import { defineFrame } from "../../core/define";

/** ẢNH MẪU (placeholder do mã vẽ, không phải tranh của họa sĩ): thay public/frames/snow-ring/96.webp + 192.webp bằng bản của họa sĩ rồi mới bật `active`. */
export default defineFrame({
  id: "snow-ring",
  name: "Vòng tuyết",
  rarity: "epic",
  unlock: { type: "event", event: "giang-sinh-2026" },
  // không có durationDays: vĩnh viễn (phần thưởng cho nhiệm vụ "hoàn thành tất cả")
  active: false,
});
