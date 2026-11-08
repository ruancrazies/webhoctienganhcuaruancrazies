import type { ThemeDef, ThemePattern } from "./define";
import { TOKEN_KEYS, TOKEN_VARS } from "./tokens";

const PATTERNS: Record<ThemePattern, { image: string; size: string }> = {
  grid: {
    image: "linear-gradient(var(--bg-pattern) 1px, transparent 1px), linear-gradient(90deg, var(--bg-pattern) 1px, transparent 1px)",
    size: "28px 28px",
  },
  dots: { image: "radial-gradient(var(--bg-pattern) 1.5px, transparent 1.6px)", size: "20px 20px" },
  none: { image: "none", size: "auto" },
};

/**
 * CSS của MỘT theme, sinh từ chính object theme (nên test tương phản chạy trên đúng dữ liệu đang dùng).
 * Selector là [data-theme="id"] (không gắn vào <html>) để xem trước được từng ô trong Bộ sưu tập/gallery.
 */
export function themeCss(t: ThemeDef): string {
  const decl = TOKEN_KEYS.map((k) => `${TOKEN_VARS[k]}:${t.tokens[k]}`);
  const p = PATTERNS[t.pattern ?? "grid"];
  decl.push(`--pattern-image:${p.image}`, `--pattern-size:${p.size}`);
  // Lời chào trang chủ: nền sáng dùng nét dạ quang dưới chữ; nền tối dùng chính màu dạ quang làm màu chữ.
  if (t.scheme === "dark") decl.push("--name-bg:none", "--name-ink:var(--mark)");
  else decl.push("--name-bg:linear-gradient(transparent 60%, var(--mark) 60%)", "--name-ink:inherit");
  decl.push(`color-scheme:${t.scheme}`);
  return `[data-theme="${t.id}"]{${decl.join(";")}}`;
}
