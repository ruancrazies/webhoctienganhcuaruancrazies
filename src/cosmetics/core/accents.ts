import type { ThemeTokens } from "./tokens";

/**
 * Màu nhấn: người dùng chọn một trong vài màu đã kiểm tương phản, đè lên bốn token nhấn của theme đang dùng
 * (accent, accentSoft, onAccent, accentEdge) và cả viền ô nhập (controlBorder luôn trùng accent ở mọi theme).
 * Mỗi màu có hai bộ: `light` cho theme nền sáng, `dark` cho theme nền tối (màu nhạt hơn, chữ trên nút đổi sang tối).
 * Không có bảng màu tự do: thêm màu = thêm một dòng ở đây; `tests/cosmetics/accents.test.ts` kiểm từng màu trên MỌI theme.
 * `null` (không chọn) = dùng màu nhấn riêng của theme.
 */
export type AccentTokens = Pick<ThemeTokens, "accent" | "accentSoft" | "onAccent" | "accentEdge">;
export type AccentDef = { id: string; name: string; light: AccentTokens; dark: AccentTokens };
export type Scheme = "light" | "dark";

export const ACCENTS: readonly AccentDef[] = [
  {
    id: "bien", name: "Xanh biển",
    light: { accent: "#0b5cad", accentSoft: "#e3effb", onAccent: "#ffffff", accentEdge: "#083f78" },
    dark: { accent: "#7cb8ff", accentSoft: "#1b2b47", onAccent: "#07162b", accentEdge: "#3f7fd0" },
  },
  {
    id: "la", name: "Xanh lá",
    light: { accent: "#1b6b3f", accentSoft: "#e1f2e8", onAccent: "#ffffff", accentEdge: "#124a2b" },
    dark: { accent: "#6fd69b", accentSoft: "#17322a", onAccent: "#06210f", accentEdge: "#2f9a63" },
  },
  {
    id: "cam", name: "Cam đất",
    light: { accent: "#a24400", accentSoft: "#fdeede", onAccent: "#ffffff", accentEdge: "#6e2d00" },
    dark: { accent: "#ffae6b", accentSoft: "#3a2616", onAccent: "#2a1400", accentEdge: "#cc7326" },
  },
  {
    id: "tim", name: "Tím",
    light: { accent: "#6a2bb8", accentSoft: "#efe6fb", onAccent: "#ffffff", accentEdge: "#46187f" },
    dark: { accent: "#c6a2ff", accentSoft: "#2f2150", onAccent: "#1a0d33", accentEdge: "#8c5ee0" },
  },
  {
    id: "hong", name: "Hồng sen",
    light: { accent: "#b3205f", accentSoft: "#fde4ee", onAccent: "#ffffff", accentEdge: "#7c1442" },
    dark: { accent: "#ff8fba", accentSoft: "#3a1c2b", onAccent: "#330b1d", accentEdge: "#d4457f" },
  },
  {
    id: "do", name: "Đỏ son",
    light: { accent: "#b3202a", accentSoft: "#fde8e8", onAccent: "#ffffff", accentEdge: "#7a1219" },
    dark: { accent: "#ff8f8f", accentSoft: "#3a1a1d", onAccent: "#330909", accentEdge: "#d44a4a" },
  },
];

export const ACCENT_IDS: readonly string[] = ACCENTS.map((a) => a.id);
export const isAccentId = (v: unknown): v is string => typeof v === "string" && ACCENT_IDS.includes(v);
export const accentById = (id: string | null | undefined): AccentDef | undefined => ACCENTS.find((a) => a.id === id);

/** Token của một theme sau khi áp màu nhấn (dùng cho cổng kiểm tương phản và hiển thị thử). */
export function withAccent(tokens: ThemeTokens, scheme: Scheme, accentId: string | null | undefined): ThemeTokens {
  const a = accentById(accentId);
  if (!a) return tokens;
  return { ...tokens, ...a[scheme], controlBorder: a[scheme].accent };
}

type ThemeRef = { id: string; scheme: Scheme };
const quote = (ids: string[]): string => ids.map((id) => `[data-theme="${id}"]`).join(",");

/**
 * CSS của MỘT màu nhấn, gắn vào <html data-accent="id">. Độ ưu tiên cao hơn `[data-theme]` nên đè được màu của theme,
 * nhưng chỉ chạm vào <html>: ô xem thử theme trong Bộ sưu tập (data-theme đặt trên phần tử con) vẫn giữ màu riêng.
 * Giá trị chỉ lấy từ ACCENTS (đã kiểm #rrggbb ở test), không nhận chuỗi từ người dùng.
 */
export function accentCss(accentId: string, themes: readonly ThemeRef[]): string {
  const a = accentById(accentId);
  if (!a) return "";
  const rules: string[] = [];
  for (const scheme of ["light", "dark"] as const) {
    const ids = themes.filter((t) => t.scheme === scheme).map((t) => t.id);
    if (!ids.length) continue;
    const t = a[scheme];
    rules.push(
      `html[data-accent="${a.id}"]:is(${quote(ids)}){--accent:${t.accent};--accent-soft:${t.accentSoft};--on-accent:${t.onAccent};--accent-edge:${t.accentEdge};--control-border:${t.accent}}`,
    );
  }
  return rules.join("");
}

/**
 * Ô màu mẫu trong màn hình chọn: biến --swatch của mỗi ô lấy theo chế độ sáng/tối của theme đang dùng.
 * Tên màu luôn hiện bằng chữ, nên ô màu chỉ là phụ (không dùng màu làm cách duy nhất để phân biệt).
 */
export function accentSwatchCss(themes: readonly ThemeRef[]): string {
  const dark = themes.filter((t) => t.scheme === "dark").map((t) => t.id);
  const out = ACCENTS.map((a) => `[data-accent-swatch="${a.id}"]{--swatch:${a.light.accent}}`);
  if (dark.length) out.push(...ACCENTS.map((a) => `:is(${quote(dark)}) [data-accent-swatch="${a.id}"]{--swatch:${a.dark.accent}}`));
  return out.join("");
}

/** Mã lấy từ DB → mã dùng được; lạ (đã bỏ khỏi code) hoặc rỗng → null = giữ màu của theme. */
export const resolveAccentId = (id: string | null | undefined): string | null => (isAccentId(id) ? id : null);
