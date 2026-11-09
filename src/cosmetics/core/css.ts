import type { ThemeDef, ThemePattern, ThemeSkin } from "./define";
import { TOKEN_KEYS, TOKEN_VARS } from "./tokens";

type PatternDef = { image: string; size: string };

/** Mọi màu trong họa tiết lấy từ token (var/color-mix) nên tự đạt tương phản và đổi theo màu nhấn của người dùng. */
const mix = (token: string, pct: number) => `color-mix(in srgb, var(${token}) ${pct}%, transparent)`;
const glow = (at: string, size: string, token: string, pct: number) => `radial-gradient(${size} at ${at}, ${mix(token, pct)}, transparent 62%)`;

const PATTERNS: Record<ThemePattern, PatternDef> = {
  grid: {
    image: "linear-gradient(var(--bg-pattern) 1px, transparent 1px), linear-gradient(90deg, var(--bg-pattern) 1px, transparent 1px)",
    size: "28px 28px",
  },
  dots: { image: "radial-gradient(var(--bg-pattern) 1.5px, transparent 1.6px)", size: "20px 20px" },
  none: { image: "none", size: "auto" },
  // Cực quang: ba vệt sáng mờ chồng nhau ở góc trên trái, trên phải và đáy.
  aurora: {
    image: [glow("6% -4%", "880px 520px", "--accent", 34), glow("100% 6%", "760px 480px", "--mark", 20), glow("46% 112%", "820px 520px", "--success", 22)].join(", "),
    size: "100% 100%",
  },
  // Lưới màu mềm: hai vệt ấm/lạnh kiểu mesh gradient.
  mesh: {
    image: [glow("0% 0%", "760px 520px", "--accent", 18), glow("100% 24%", "700px 520px", "--mark", 30), glow("12% 100%", "800px 540px", "--danger", 12)].join(", "),
    size: "100% 100%",
  },
  // Sóng: vảy cá xếp lớp, nét mảnh.
  waves: {
    image: `radial-gradient(circle at 50% 0, transparent 0 17px, var(--bg-pattern) 18px 20px, transparent 21px), radial-gradient(circle at 0 24px, transparent 0 17px, var(--bg-pattern) 18px 20px, transparent 21px), radial-gradient(circle at 100% 24px, transparent 0 17px, var(--bg-pattern) 18px 20px, transparent 21px), ${glow("50% -6%", "900px 420px", "--accent", 16)}`,
    size: "44px 48px, 44px 48px, 44px 48px, 100% 100%",
  },
  diagonal: { image: "repeating-linear-gradient(135deg, var(--bg-pattern) 0 2px, transparent 2px 14px)", size: "auto" },
  // Sao: ba lớp chấm sáng khác cỡ trên nền có quầng sáng.
  stars: {
    image: `radial-gradient(1.4px 1.4px at 22px 34px, var(--bg-pattern), transparent), radial-gradient(1px 1px at 96px 86px, var(--bg-pattern), transparent), radial-gradient(1.8px 1.8px at 150px 18px, var(--bg-pattern), transparent), ${glow("50% -8%", "900px 480px", "--accent", 22)}`,
    size: "180px 120px, 180px 120px, 180px 120px, 100% 100%",
  },
  // Cánh hoa: hai cỡ chấm lệch nhau trên nền có vệt hồng mờ.
  petals: {
    image: `radial-gradient(circle at 14px 14px, var(--bg-pattern) 5px, transparent 5.6px), radial-gradient(circle at 38px 34px, ${mix("--bg-pattern", 70)} 3px, transparent 3.6px), ${glow("100% 0%", "720px 460px", "--accent", 12)}`,
    size: "52px 52px, 52px 52px, 100% 100%",
  },
  // Hoàng hôn: vầng sáng ngang phía trên rồi tan dần xuống nền.
  sunset: {
    image: `linear-gradient(180deg, ${mix("--mark", 42)}, transparent 420px), ${glow("80% 0%", "640px 420px", "--danger", 14)}, radial-gradient(var(--bg-pattern) 1.2px, transparent 1.3px)`,
    size: "100% 100%, 100% 100%, 22px 22px",
  },
};

type SkinDef = Record<string, string>;

/**
 * Bộ biến hình khối của từng skin. globals.css chỉ đọc các biến này nên thêm skin = thêm một dòng ở đây.
 * Mặc định (paper) trùng từng giá trị của giao diện gốc để theme cũ không đổi một điểm ảnh.
 */
const SKINS: Record<ThemeSkin, SkinDef> = {
  paper: {
    "--radius": "12px", "--radius-btn": "10px", "--bw": "1.5px",
    "--card-line": "var(--accent)", "--card-line-soft": "var(--border)", "--card-shadow": "0 0 0 0 transparent", "--card-hover": "0 0 0 0 transparent", "--lift": "0px",
    "--fill": "var(--surface)", "--blur": "none",
    "--btn-line": "var(--accent)", "--btn-light-line": "var(--accent)", "--btn-sheen": "none",
    "--btn-shadow": "0 3px 0 var(--accent-edge)", "--btn-shadow-sm": "0 2px 0 var(--accent-edge)", "--btn-shadow-down": "0 1px 0 var(--accent-edge)",
    "--btn-light-shadow": "0 3px 0 var(--border)", "--press": "0px 2px",
    "--margin-op": "0.55", "--sheet-pl": "30px", "--sheet-margin": "16px", "--auth-pl": "36px",
    "--bar-fill": "var(--accent)", "--bar-h": "10px",
    "--font-display": "var(--font-sans)", "--head-weight": "800",
    "--logo-bg": "var(--mark)",
  },
  clay: {
    "--radius": "22px", "--radius-btn": "16px", "--bw": "2px",
    "--card-line": mix("--accent", 22), "--card-line-soft": mix("--accent", 14),
    "--card-shadow": `0 12px 26px -10px ${mix("--accent", 34)}, inset 0 -4px 0 ${mix("--accent", 9)}, inset 0 2px 0 ${mix("--surface", 90)}`,
    "--card-hover": `0 18px 32px -10px ${mix("--accent", 42)}, inset 0 -4px 0 ${mix("--accent", 12)}`, "--lift": "3px",
    "--fill": "var(--surface)", "--blur": "none",
    "--btn-line": "transparent", "--btn-light-line": mix("--accent", 28), "--btn-sheen": `linear-gradient(180deg, ${mix("--on-accent", 9)}, transparent 55%)`,
    "--btn-shadow": `0 5px 0 var(--accent-edge), 0 12px 18px -8px ${mix("--accent", 55)}`, "--btn-shadow-sm": `0 3px 0 var(--accent-edge), 0 8px 12px -6px ${mix("--accent", 50)}`, "--btn-shadow-down": "0 1px 0 var(--accent-edge)",
    "--btn-light-shadow": `0 5px 0 var(--border), 0 12px 18px -10px ${mix("--accent", 30)}`, "--press": "0px 4px",
    "--margin-op": "0", "--sheet-pl": "20px", "--sheet-margin": "0px", "--auth-pl": "24px",
    "--bar-fill": `linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--mark)))`, "--bar-h": "14px",
    "--font-display": `"Baloo 2", var(--font-sans)`, "--head-weight": "800",
    "--logo-bg": `linear-gradient(145deg, var(--mark), color-mix(in srgb, var(--mark) 55%, var(--accent)))`,
  },
  soft: {
    "--radius": "18px", "--radius-btn": "12px", "--bw": "1px",
    "--card-line": "var(--border)", "--card-line-soft": "var(--border)",
    "--card-shadow": `0 1px 2px ${mix("--text", 8)}, 0 12px 28px -14px ${mix("--text", 30)}`,
    "--card-hover": `0 2px 4px ${mix("--text", 8)}, 0 18px 34px -14px ${mix("--text", 38)}`, "--lift": "2px",
    "--fill": "var(--surface)", "--blur": "none",
    "--btn-line": "transparent", "--btn-light-line": "var(--border)", "--btn-sheen": `linear-gradient(180deg, ${mix("--on-accent", 8)}, transparent 60%)`,
    "--btn-shadow": `0 1px 0 var(--accent-edge), 0 10px 18px -8px ${mix("--accent", 60)}`, "--btn-shadow-sm": `0 1px 0 var(--accent-edge), 0 6px 12px -6px ${mix("--accent", 55)}`, "--btn-shadow-down": `0 0 0 var(--accent-edge)`,
    "--btn-light-shadow": `0 1px 2px ${mix("--text", 10)}, 0 6px 14px -8px ${mix("--text", 30)}`, "--press": "0px 1px",
    "--margin-op": "0", "--sheet-pl": "20px", "--sheet-margin": "0px", "--auth-pl": "24px",
    "--bar-fill": "linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 70%, var(--mark)))", "--bar-h": "10px",
    "--font-display": "var(--font-sans)", "--head-weight": "800",
    "--logo-bg": "linear-gradient(145deg, var(--mark), color-mix(in srgb, var(--mark) 60%, var(--accent)))",
  },
  glass: {
    "--radius": "20px", "--radius-btn": "14px", "--bw": "1px",
    "--card-line": mix("--text", 18), "--card-line-soft": mix("--text", 12),
    "--card-shadow": `0 14px 40px -16px ${mix("--accent", 55)}, inset 0 1px 0 ${mix("--text", 12)}`,
    "--card-hover": `0 18px 46px -14px ${mix("--accent", 70)}, inset 0 1px 0 ${mix("--text", 18)}`, "--lift": "2px",
    "--fill": `color-mix(in srgb, var(--surface) 80%, transparent)`, "--blur": "blur(16px) saturate(140%)",
    "--btn-line": mix("--on-accent", 25), "--btn-light-line": mix("--accent", 45), "--btn-sheen": `linear-gradient(180deg, ${mix("--on-accent", 10)}, transparent 55%)`,
    "--btn-shadow": `0 0 0 1px ${mix("--accent", 55)}, 0 8px 24px -6px ${mix("--accent", 65)}`, "--btn-shadow-sm": `0 0 0 1px ${mix("--accent", 50)}, 0 4px 14px -4px ${mix("--accent", 60)}`, "--btn-shadow-down": `0 0 0 1px ${mix("--accent", 55)}`,
    "--btn-light-shadow": `0 6px 18px -8px ${mix("--accent", 50)}`, "--press": "0px 1px",
    "--margin-op": "0", "--sheet-pl": "20px", "--sheet-margin": "0px", "--auth-pl": "24px",
    "--bar-fill": "linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 60%, var(--success)))", "--bar-h": "10px",
    "--font-display": "var(--font-sans)", "--head-weight": "800",
    "--logo-bg": "linear-gradient(145deg, var(--mark), color-mix(in srgb, var(--mark) 50%, var(--accent)))",
  },
  neo: {
    "--radius": "10px", "--radius-btn": "8px", "--bw": "2.5px",
    "--card-line": "var(--text)", "--card-line-soft": "var(--text)", "--card-shadow": "5px 5px 0 var(--text)", "--card-hover": "8px 8px 0 var(--text)", "--lift": "3px",
    "--fill": "var(--surface)", "--blur": "none",
    "--btn-line": "var(--text)", "--btn-light-line": "var(--text)", "--btn-sheen": "none",
    "--btn-shadow": "4px 4px 0 var(--text)", "--btn-shadow-sm": "3px 3px 0 var(--text)", "--btn-shadow-down": "0 0 0 var(--text)",
    "--btn-light-shadow": "4px 4px 0 var(--text)", "--press": "4px 4px",
    "--margin-op": "0", "--sheet-pl": "18px", "--sheet-margin": "0px", "--auth-pl": "24px",
    "--bar-fill": "var(--accent)", "--bar-h": "14px",
    "--font-display": "var(--font-sans)", "--head-weight": "800",
    "--logo-bg": "var(--mark)",
  },
};

/** Khai báo biến hình khối của một skin (dùng chung cho theme trong app và scene đăng nhập). */
export function skinDecls(skin: ThemeSkin): string[] {
  return Object.entries(SKINS[skin]).map(([k, v]) => `${k}:${v}`);
}

/**
 * CSS của MỘT theme, sinh từ chính object theme (nên test tương phản chạy trên đúng dữ liệu đang dùng).
 * Selector là [data-theme="id"] (không gắn vào <html>) để xem trước được từng ô trong Bộ sưu tập/gallery.
 */
export function themeCss(t: ThemeDef): string {
  const decl = TOKEN_KEYS.map((k) => `${TOKEN_VARS[k]}:${t.tokens[k]}`);
  const p = PATTERNS[t.pattern ?? "grid"];
  decl.push(`--pattern-image:${p.image}`, `--pattern-size:${p.size}`);
  decl.push(...skinDecls(t.skin ?? "paper"));
  // Lời chào trang chủ: nền sáng dùng nét dạ quang dưới chữ; nền tối dùng chính màu dạ quang làm màu chữ.
  if (t.scheme === "dark") decl.push("--name-bg:none", "--name-ink:var(--mark)");
  else decl.push("--name-bg:linear-gradient(transparent 60%, var(--mark) 60%)", "--name-ink:inherit");
  decl.push(`color-scheme:${t.scheme}`);
  return `[data-theme="${t.id}"]{${decl.join(";")}}`;
}
