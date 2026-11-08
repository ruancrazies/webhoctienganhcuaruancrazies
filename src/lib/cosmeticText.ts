/** Chữ tiếng Việt cho Bộ sưu tập và thông báo mở khóa/hết hạn. Tách khỏi core để core chỉ chứa quy tắc thuần. */
import type { Acquire, ItemState, Notice } from "../core/cosmetics";
import { fmtNumber } from "./format";

const VN_OFFSET_MS = 7 * 3600 * 1000;

/** "dd/mm" theo giờ Việt Nam (không phụ thuộc múi giờ máy chạy). */
export function fmtDayMonth(iso: string): string {
  const d = new Date(new Date(iso).getTime() + VN_OFFSET_MS);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** `eventNames`: mã sự kiện → tên đang hiển thị (nếu biết) để nói rõ "Nhận trong sự kiện “Giáng sinh”". */
export type EventNames = ReadonlyMap<string, string>;

export function acquireText(a: Acquire, eventNames?: EventNames): string {
  if (a.type === "level") return a.reached ? `Đã đủ Level ${a.level}, đang mở khóa…` : `Cần Level ${a.level} — còn ${fmtNumber(a.xpLeft)} XP`;
  if (a.type === "event") {
    const name = eventNames?.get(a.event);
    return name ? `Nhận trong sự kiện “${name}”` : "Nhận trong sự kiện";
  }
  return "Nhận qua phần thưởng hoặc quà tặng";
}

/** Nhãn hạn dùng bằng CHỮ (không chỉ màu); null nếu không có gì để nói (vĩnh viễn, chưa mở). */
export function expiryText(s: ItemState): string | null {
  if (s.status === "owned") return s.daysLeft === null ? null : `Còn ${s.daysLeft} ngày`;
  if (s.status === "expired") return `Hết hạn ${fmtDayMonth(s.expiredAt)}`;
  return null;
}

/** Dòng mô tả điều kiện/tình trạng dưới tên món. */
export function stateText(s: ItemState, eventNames?: EventNames): string {
  switch (s.status) {
    case "owned":
      return s.permanent ? "Đã có · vĩnh viễn" : `Đã có · hết hạn ${fmtDayMonth(s.expiresAt!)}`;
    case "expired":
      return s.acquire ? `Đã hết hạn. ${acquireText(s.acquire, eventNames)} để nhận lại` : "Đã hết hạn";
    case "locked":
      return s.opensAt ? `${acquireText(s.acquire, eventNames)} · mở từ ${fmtDayMonth(s.opensAt)}` : acquireText(s.acquire, eventNames);
    default:
      return "Đã ngừng cung cấp";
  }
}

export type NoticeMessage = { id: string; text: string };

const list = (names: string[]): string => {
  const q = names.map((n) => `“${n}”`);
  return q.length <= 3 ? q.join(", ") : `${q.slice(0, 3).join(", ")} và ${q.length - 3} món khác`;
};

/**
 * Gộp thông báo thành vài câu cho thú cưng (một câu cho mỗi loại, kể cả khi mở nhiều món một lúc).
 * `id` ổn định theo nội dung để petSay chống lặp trong cùng phiên.
 */
export function noticeMessages(notices: readonly Notice[], nameOf: (id: string) => string): NoticeMessage[] {
  const out: NoticeMessage[] = [];
  const pick = <K extends Notice["kind"]>(kind: K) => notices.filter((n): n is Extract<Notice, { kind: K }> => n.kind === kind);

  const unlock = pick("unlock");
  if (unlock.length) {
    const ids = unlock.map((n) => n.id);
    const names = ids.map(nameOf);
    out.push({
      id: `cos:unlock:${ids.join(",")}`,
      text: unlock.length === 1 ? `Bạn vừa mở khóa “${names[0]}”! Vào Bộ sưu tập để dùng nhé.` : `Bạn vừa mở khóa ${unlock.length} món mới: ${list(names)}. Vào Bộ sưu tập để xem nhé.`,
    });
  }
  for (const stage of [1, 2] as const) {
    const soon = pick("soon").filter((n) => n.stage === stage);
    if (!soon.length) continue;
    const ids = soon.map((n) => n.id);
    const names = ids.map(nameOf);
    const when = stage === 2 ? "dưới 1 ngày" : `${Math.max(...soon.map((n) => n.daysLeft))} ngày`;
    out.push({
      id: `cos:soon${stage}:${ids.join(",")}`,
      text: soon.length === 1 ? `“${names[0]}” còn ${when} là hết hạn.` : `${list(names)} sắp hết hạn, còn ${when}.`,
    });
  }
  const expired = pick("expired");
  if (expired.length) {
    const ids = expired.map((n) => n.id);
    out.push({ id: `cos:expired:${ids.join(",")}`, text: `${list(ids.map(nameOf))} đã hết hạn nên mình đưa về mặc định. Món vẫn nằm trong Bộ sưu tập.` });
  }
  return out;
}
