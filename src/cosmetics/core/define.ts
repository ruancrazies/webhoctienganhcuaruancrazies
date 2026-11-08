import type { ThemeTokens } from "./tokens";
import { assertId, type Unlock } from "./unlock";

export type ThemeGroup = "classic" | "sweet" | "mystic" | "nature" | "event";
export const THEME_GROUP_LABEL: Record<ThemeGroup, string> = {
  classic: "Cổ điển",
  sweet: "Ngọt ngào",
  mystic: "Huyền bí",
  nature: "Thiên nhiên",
  event: "Sự kiện",
};
export type ThemePattern = "grid" | "dots" | "none";

export type ThemeDef = {
  /** Bất biến: DB và cookie tham chiếu mã này. Đổi tên chỉ đổi `name`. */
  id: string;
  name: string;
  group: ThemeGroup;
  /** Quyết định color-scheme (thanh cuộn, ô nhập mặc định của trình duyệt). */
  scheme: "light" | "dark";
  unlock: Unlock;
  tokens: ThemeTokens;
  /** Họa tiết nền. Mặc định: grid (ô ly). */
  pattern?: ThemePattern;
  /** Thứ tự hiển thị (nhỏ trước); mặc định 100. */
  sort?: number;
  /** false = ngừng cung cấp: người đã sở hữu vẫn thấy, người khác không chọn được. Không xóa thư mục. */
  active?: boolean;
};

export type AvatarDef = {
  id: string;
  name: string;
  series: string;
  unlock: Unlock;
  /** Số ngày dùng được kể từ lúc nhận; bỏ trống = vĩnh viễn. */
  durationDays?: number;
  sort?: number;
  active?: boolean;
};

export type Rarity = "common" | "rare" | "epic" | "legendary";
/** Bậc hiếm phân biệt bằng NHÃN CHỮ (và hình dáng khung), không chỉ bằng màu. */
export const RARITY_LABEL: Record<Rarity, string> = { common: "Thường", rare: "Hiếm", epic: "Sử thi", legendary: "Huyền thoại" };

export type FrameDef = {
  id: string;
  name: string;
  rarity: Rarity;
  unlock: Unlock;
  durationDays?: number;
  sort?: number;
  active?: boolean;
};

export function defineTheme<T extends ThemeDef>(t: T): T {
  assertId("theme", t.id);
  return t;
}
export function defineAvatar<T extends AvatarDef>(a: T): T {
  assertId("avatar", a.id);
  return a;
}
export function defineFrame<T extends FrameDef>(f: T): T {
  assertId("frame", f.id);
  return f;
}
