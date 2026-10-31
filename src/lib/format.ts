import type { Cefr } from "../core/types";
import type { LearnState } from "../types/api";

export const LEVEL_NAMES: Record<Cefr, string> = {
  A1: "Mới bắt đầu",
  A2: "Sơ cấp",
  B1: "Trung cấp",
  B2: "Trung cấp cao",
  C1: "Nâng cao",
  C2: "Thành thạo",
};

export const STATE_LABEL: Record<LearnState, string> = {
  new: "Mới",
  learned: "Đã học",
  due: "Cần ôn",
  mastered: "Đã thuộc",
};

export const POS_LABEL: Record<string, string> = {
  n: "danh từ",
  v: "động từ",
  adj: "tính từ",
  adv: "trạng từ",
  prep: "giới từ",
  pron: "đại từ",
  conj: "liên từ",
  det: "từ hạn định",
  interj: "thán từ",
  num: "số từ",
  modal: "trợ động từ",
  phrase: "cụm từ",
};

export const posLabel = (pos: string) => POS_LABEL[pos] ?? pos;

export const nextLevel = (c: Cefr): Cefr | null => {
  const order: Cefr[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const i = order.indexOf(c);
  return i >= 0 && i < order.length - 1 ? order[i + 1] : null;
};

export const prevLevel = (c: Cefr): Cefr | null => {
  const order: Cefr[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const i = order.indexOf(c);
  return i > 0 ? order[i - 1] : null;
};

export const isCefr = (x: string): x is Cefr => ["A1", "A2", "B1", "B2", "C1", "C2"].includes(x);

export const fmtNumber = (n: number) => n.toLocaleString("vi-VN");
export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const ratio = (a: number, b: number) => (b > 0 ? Math.min(1, a / b) : 0);

/** 90 → "1:30" */
export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Giờ theo múi giờ Việt Nam, ví dụ "14:35 hôm nay" / "00:00 ngày 25/10". */
export function fmtVnTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const opt = { timeZone: "Asia/Ho_Chi_Minh" } as const;
  const hm = d.toLocaleTimeString("vi-VN", { ...opt, hour: "2-digit", minute: "2-digit", hour12: false });
  const day = (x: Date) => x.toLocaleDateString("en-CA", opt);
  if (day(d) === day(now)) return `${hm} hôm nay`;
  const dm = d.toLocaleDateString("vi-VN", { ...opt, day: "2-digit", month: "2-digit" });
  return `${hm} ngày ${dm}`;
}

/** "28/10/2026 14:35" theo múi giờ Việt Nam. */
export function fmtVnDateTime(iso: string): string {
  const d = new Date(iso);
  const opt = { timeZone: "Asia/Ho_Chi_Minh" } as const;
  const date = d.toLocaleDateString("vi-VN", { ...opt, day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("vi-VN", { ...opt, hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} ${time}`;
}

/** Nhãn bốn phần của bài thi / kiểm tra. */
export const PART_LABEL = { vocab: "Từ vựng", grammar: "Ngữ pháp", reading: "Bài đọc", listening: "Bài nghe" } as const;
