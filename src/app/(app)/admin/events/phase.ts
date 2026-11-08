import type { EventPhase } from "@/core/seasonEvents";

/** Màu chip theo giai đoạn (chữ luôn có nhãn đi kèm, không chỉ dùng màu). Tách khỏi page.tsx vì Next không cho page xuất thêm. */
export const PHASE_CHIP: Record<EventPhase, string> = { draft: "chip chip-plain", scheduled: "chip chip-mark", running: "chip chip-good", claiming: "chip chip-warn", ended: "chip chip-plain" };
