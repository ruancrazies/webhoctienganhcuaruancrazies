/**
 * Bộ token ngữ nghĩa duy nhất của giao diện. Component và CSS chỉ dùng các biến này (var(--accent)…),
 * không dùng mã màu thô hay tên cũ (--paper, --ink…). Thêm token = thêm một dòng ở đây; mọi theme thiếu token
 * sẽ báo lỗi biên dịch (ThemeTokens là kiểu đầy đủ).
 */
export const TOKEN_VARS = {
  bg: "--bg", // nền trang
  bgPattern: "--bg-pattern", // màu nét họa tiết nền (ô ly, chấm…)
  surface: "--surface", // bề mặt: thẻ, tờ vở, ô nhập
  text: "--text", // chữ chính
  textSoft: "--text-soft", // chữ phụ (vẫn đạt 4.5:1)
  textFaint: "--text-faint", // chữ mờ: chỉ cho chữ lớn / trang trí / mục bị khóa (đạt 3:1)
  accent: "--accent", // màu nhấn chính: nút, liên kết, viền khung
  accentSoft: "--accent-soft", // nền nhạt của màu nhấn
  onAccent: "--on-accent", // chữ trên nền --accent
  accentEdge: "--accent-edge", // bóng "đáy" của nút
  mark: "--mark", // đánh dấu (bút dạ quang)
  onMark: "--on-mark", // chữ trên nền --mark
  markEdge: "--mark-edge",
  border: "--border", // đường kẻ phân cách (trang trí, không dùng làm viền ô nhập)
  controlBorder: "--control-border", // viền ô nhập / điều khiển (đạt 3:1 so với bề mặt)
  margin: "--margin", // đường lề đỏ của tờ vở
  danger: "--danger",
  dangerSoft: "--danger-soft",
  onDanger: "--on-danger",
  dangerEdge: "--danger-edge",
  success: "--success",
  successSoft: "--success-soft",
  onSuccess: "--on-success",
  successEdge: "--success-edge",
  warning: "--warning",
  warningSoft: "--warning-soft",
  rankGold: "--rank-gold",
  rankSilver: "--rank-silver",
  rankBronze: "--rank-bronze",
} as const;

export type TokenKey = keyof typeof TOKEN_VARS;
export type ThemeTokens = Record<TokenKey, string>;
export const TOKEN_KEYS = Object.keys(TOKEN_VARS) as TokenKey[];

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
