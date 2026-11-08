/**
 * npm run gen:registry          → ghi src/cosmetics/registry.generated.ts và registry/loader của Scene đăng nhập
 * npm run check:registry        → báo lỗi (exit 1) nếu tệp đã sinh không khớp thư mục (dùng trong CI)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { REGISTRY_FILE, SCENE_LOADERS_FILE, SCENE_REGISTRY_FILE, renderDrawLoaders, renderRegistry, renderSceneRegistry, scan, scanScenes } from "./lib";

const scenes = scanScenes();
const targets = [
  { file: REGISTRY_FILE, next: renderRegistry(scan()) },
  { file: SCENE_REGISTRY_FILE, next: renderSceneRegistry(scenes) },
  { file: SCENE_LOADERS_FILE, next: renderDrawLoaders(scenes) },
];
const check = process.argv.includes("--check");
let stale = 0;
for (const { file, next } of targets) {
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (current === next) continue;
  if (check) {
    console.error(`${file} đã cũ so với thư mục. Chạy: npm run gen:registry`);
    stale++;
  } else {
    writeFileSync(file, next);
    console.log(`Đã cập nhật ${file}`);
  }
}
if (check) {
  if (stale) process.exit(1);
  console.log("Các registry sinh tự động khớp thư mục.");
} else if (!stale) console.log("Registry đã đồng bộ.");
