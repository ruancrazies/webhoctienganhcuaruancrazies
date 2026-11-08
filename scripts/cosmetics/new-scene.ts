/**
 * npm run new:scene <id>
 * Tạo src/features/login-scene/scenes/<id>/{scene.ts,scene.css} (+ draw.ts nếu thêm --canvas) và sinh lại registry.
 * Scene mới có `active: false`: admin chưa chọn được cho tới khi bạn duyệt ở /admin/gallery và đổi thành true.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ID_RE } from "../../src/cosmetics/core/unlock";
import { SCENES_DIR, SCENE_LOADERS_FILE, SCENE_REGISTRY_FILE, renderDrawLoaders, renderSceneRegistry, scanScenes } from "./lib";

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--"));
const withCanvas = args.includes("--canvas");
if (!id) {
  console.error("Cách dùng: npm run new:scene <id> [-- --canvas]");
  process.exit(1);
}
if (!ID_RE.test(id)) {
  console.error(`id "${id}" không hợp lệ: chữ thường, số, gạch ngang; 2–24 ký tự; bắt đầu bằng chữ cái.`);
  process.exit(1);
}
const dir = path.join(SCENES_DIR, id);
if (existsSync(dir)) {
  console.error(`Đã tồn tại: src/features/login-scene/scenes/${id}`);
  process.exit(1);
}

const title = id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, " ");
mkdirSync(dir, { recursive: true });

writeFileSync(
  path.join(dir, "scene.ts"),
  `import { defineScene } from "../types";
import base from "../default/scene";

export default defineScene({
  id: "${id}",
  name: "${title}", // tên cho admin
  greeting: "Xin chào!", // văn bản thật, tối đa 80 ký tự
  tagline: "Một dòng phụ ngắn.",
  sort: 100,
  active: false, // đổi thành true khi đã duyệt ở /admin/gallery
  tokens: {
    ...base.tokens,
    // TODO: ghi đè màu. Thẻ đăng nhập (surface/text/accent…) phải đạt 4.5:1; sân khấu (stage*) đạt 4.5:1 cho chữ và 3:1 cho stageAccent. \`npm test\` báo lỗi nếu thiếu.
  },${
    withCanvas
      ? `
  canvas: { mascot: "walk", toolLabel: "Công cụ", hint: "Kéo công cụ, chạm vào chấm tròn để xoay, rồi chiếu vào ô mật khẩu.", ambient: false },`
      : ""
  }
});
`,
);
writeFileSync(
  path.join(dir, "scene.css"),
  `/* Hình tĩnh của scene (hiện ngay trong HTML, không cần JavaScript). Chỉ dùng biến --ls-* và hình học CSS; không emoji, không ảnh ngoài. */
[data-login-scene="${id}"] .ls-art { }
`,
);
if (withCanvas) {
  writeFileSync(
    path.join(dir, "draw.ts"),
    `import type { SceneDraw } from "../types";

/** Mỗi hàm vẽ trong toạ độ px CSS; ctx đã được nhân DPR sẵn. Xem halloween/draw.ts làm mẫu. Ngân sách: ≤ 20 KB gzip. */
const draw: SceneDraw = {
  drawMascot(ctx, s) {
    ctx.fillStyle = s.pal.accent;
    ctx.beginPath();
    ctx.arc(s.mascot.x, s.mascot.y, 14, 0, Math.PI * 2);
    ctx.fill();
  },
  drawTool(ctx, s) {
    ctx.save();
    ctx.translate(s.tool.x, s.tool.y);
    ctx.rotate(s.tool.angle);
    ctx.fillStyle = s.pal.text;
    ctx.fillRect(-14, -6, 28, 12);
    ctx.restore();
  },
  drawDecor() {},
};
export default draw;
`,
  );
}

const found = scanScenes();
writeFileSync(SCENE_REGISTRY_FILE, renderSceneRegistry(found));
writeFileSync(SCENE_LOADERS_FILE, renderDrawLoaders(found));
console.log(`Đã tạo src/features/login-scene/scenes/${id}/ và cập nhật registry.`);
console.log("Sửa tokens trong scene.ts, xem /admin/gallery để kiểm tương phản, rồi đặt active: true.");
