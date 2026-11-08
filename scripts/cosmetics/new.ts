/**
 * npm run new:theme <id>   npm run new:avatar <id>   npm run new:frame <id>
 * Tạo thư mục + manifest mẫu rồi sinh lại registry. Món mới có `active: false`: chưa ai chọn được cho tới khi bạn bật.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ID_RE } from "../../src/cosmetics/core/unlock";
import { COSMETICS_DIR, REGISTRY_FILE, ROOT, renderRegistry, scan } from "./lib";

const [kind, id] = process.argv.slice(2);
if (!["theme", "avatar", "frame"].includes(kind ?? "") || !id) {
  console.error("Cách dùng: npm run new:theme|new:avatar|new:frame <id>");
  process.exit(1);
}
if (!ID_RE.test(id)) {
  console.error(`id "${id}" không hợp lệ: chữ thường, số, gạch ngang; 2–24 ký tự; bắt đầu bằng chữ cái.`);
  process.exit(1);
}

const title = id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, " ");

const TEMPLATES: Record<string, { dir: string; file: string; body: string; note: string }> = {
  theme: {
    dir: "themes",
    file: "theme.ts",
    note: "Sửa `tokens` (đang sao chép từ Vở ô ly), đặt tên tiếng Việt, rồi xem /admin/gallery để kiểm tương phản.",
    body: `import { defineTheme } from "../../core/define";
import paper from "../paper/theme";

export default defineTheme({
  id: "${id}",
  name: "${title}", // tên tiếng Việt hiển thị cho người dùng
  group: "classic", // classic | sweet | mystic | nature | event
  scheme: "light", // light | dark (đặt color-scheme của trình duyệt)
  unlock: { type: "level", level: 10 }, // default | level | event | grant
  active: false, // đổi thành true khi đã duyệt ở /admin/gallery
  pattern: "grid", // grid | dots | none
  tokens: {
    ...paper.tokens,
    // TODO: ghi đè từng token bên dưới; thiếu hay sai tương phản thì \`npm test\` báo lỗi.
    // bg: "#fff0f6",
  },
});
`,
  },
  avatar: {
    dir: "avatars",
    file: "avatar.ts",
    note: `Đặt ảnh WebP nền trong suốt vào public/avatars/${id}/96.webp và 192.webp (mỗi ảnh dưới 15 KB), rồi đổi active thành true.`,
    body: `import { defineAvatar } from "../../core/define";

export default defineAvatar({
  id: "${id}",
  name: "${title}", // tên tiếng Việt, đọc được bằng screen reader trong màn hình chọn
  series: "Chưa phân bộ",
  unlock: { type: "level", level: 10 },
  // durationDays: 30, // bỏ trống = vĩnh viễn
  active: false, // đổi thành true khi đã có ảnh 96/192
});
`,
  },
  frame: {
    dir: "frames",
    file: "frame.ts",
    note: `Đặt ảnh khung (cùng kích thước avatar, phần giữa để trống) vào public/frames/${id}/96.webp và 192.webp, rồi đổi active thành true.`,
    body: `import { defineFrame } from "../../core/define";

export default defineFrame({
  id: "${id}",
  name: "${title}",
  rarity: "common", // common | rare | epic | legendary (hiện bằng nhãn chữ, không chỉ bằng màu)
  unlock: { type: "event", event: "ten-su-kien" },
  // durationDays: 30,
  active: false, // đổi thành true khi đã có ảnh 96/192
});
`,
  },
};

const t = TEMPLATES[kind!]!;
const dir = path.join(COSMETICS_DIR, t.dir, id);
if (existsSync(dir)) {
  console.error(`Đã tồn tại: src/cosmetics/${t.dir}/${id}`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, t.file), t.body);
writeFileSync(REGISTRY_FILE, renderRegistry(scan()));

console.log(`Đã tạo src/cosmetics/${t.dir}/${id}/${t.file} và cập nhật registry.`);
console.log(t.note);
console.log(`(thư mục gốc: ${path.relative(process.cwd(), ROOT) || "."})`);
