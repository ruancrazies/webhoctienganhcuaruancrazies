/** Avatar có sẵn: người dùng chọn một mã, DB chỉ lưu mã (profiles.avatar). Hàm thuần, dùng được ở server lẫn client. */
export const AVATARS = [
  { id: "fox", emoji: "🦊", bg: "#ffd8b0", label: "Cáo" },
  { id: "cat", emoji: "🐱", bg: "#ffe3a3", label: "Mèo" },
  { id: "dog", emoji: "🐶", bg: "#e6d3bd", label: "Chó" },
  { id: "panda", emoji: "🐼", bg: "#dfe7f5", label: "Gấu trúc" },
  { id: "lion", emoji: "🦁", bg: "#ffe08a", label: "Sư tử" },
  { id: "frog", emoji: "🐸", bg: "#c9efc4", label: "Ếch" },
  { id: "owl", emoji: "🦉", bg: "#e3d5f5", label: "Cú" },
  { id: "penguin", emoji: "🐧", bg: "#cfe6fb", label: "Cánh cụt" },
  { id: "rabbit", emoji: "🐰", bg: "#fbd3e0", label: "Thỏ" },
  { id: "bear", emoji: "🐻", bg: "#ecd2b8", label: "Gấu" },
  { id: "tiger", emoji: "🐯", bg: "#ffd199", label: "Hổ" },
  { id: "koala", emoji: "🐨", bg: "#d9dfe8", label: "Koala" },
  { id: "unicorn", emoji: "🦄", bg: "#f6d5f2", label: "Kỳ lân" },
  { id: "octopus", emoji: "🐙", bg: "#f9c9c9", label: "Bạch tuộc" },
  { id: "whale", emoji: "🐳", bg: "#bfe3f2", label: "Cá voi" },
  { id: "dino", emoji: "🦖", bg: "#cdeac0", label: "Khủng long" },
] as const;

export type Avatar = (typeof AVATARS)[number];
export const AVATAR_IDS: readonly string[] = AVATARS.map((a) => a.id);

export const isAvatarId = (v: unknown): v is Avatar["id"] => typeof v === "string" && AVATAR_IDS.includes(v);

/** Tìm avatar theo mã; không có (hoặc mã lạ) thì null. */
export const avatarOf = (id: string | null | undefined): Avatar | null => AVATARS.find((a) => a.id === id) ?? null;
