import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/** Quét src/cosmetics/<loại>/<id>/ và dựng registry. Hàm thuần theo hệ thống tệp, dùng chung cho script lẫn test CI. */
export const ROOT = path.resolve(__dirname, "..", "..");
export const COSMETICS_DIR = path.join(ROOT, "src", "cosmetics");
export const REGISTRY_FILE = path.join(COSMETICS_DIR, "registry.generated.ts");

export type KindSpec = {
  kind: "theme" | "avatar" | "frame";
  dir: string; // thư mục con của src/cosmetics
  file: string; // tệp manifest bắt buộc trong mỗi thư mục
  exportName: string;
  type: string; // kiểu TypeScript của mỗi phần tử
};

export const KINDS: KindSpec[] = [
  { kind: "theme", dir: "themes", file: "theme.ts", exportName: "THEMES", type: "ThemeDef" },
  { kind: "avatar", dir: "avatars", file: "avatar.ts", exportName: "AVATARS", type: "AvatarDef" },
  { kind: "frame", dir: "frames", file: "frame.ts", exportName: "FRAMES", type: "FrameDef" },
];

export type Found = { spec: KindSpec; ids: string[] };

/** Thư mục bắt đầu bằng "_" hoặc "." được bỏ qua (mẫu, nháp). Thiếu tệp manifest thì ném lỗi. */
export function scan(root: string = COSMETICS_DIR): Found[] {
  return KINDS.map((spec) => {
    const base = path.join(root, spec.dir);
    const ids = existsSync(base)
      ? readdirSync(base)
          .filter((n) => !n.startsWith("_") && !n.startsWith(".") && statSync(path.join(base, n)).isDirectory())
          .sort()
      : [];
    for (const id of ids) {
      if (!existsSync(path.join(base, id, spec.file))) throw new Error(`Thiếu ${spec.file} trong src/cosmetics/${spec.dir}/${id}/`);
    }
    return { spec, ids };
  });
}

const ident = (kind: string, id: string) => `${kind}_${id.replace(/[^a-z0-9]/g, "_")}`;

export function renderRegistry(found: Found[]): string {
  const lines: string[] = [
    "// Tệp SINH TỰ ĐỘNG bởi `npm run gen:registry` (chạy trong prebuild). KHÔNG sửa tay.",
    "// Thêm theme/avatar/khung = thêm một thư mục trong src/cosmetics (xem docs/cosmetics.md).",
    'import type { AvatarDef, FrameDef, ThemeDef } from "./core/define";',
  ];
  for (const { spec, ids } of found) {
    for (const id of ids) lines.push(`import ${ident(spec.kind, id)} from "./${spec.dir}/${id}/${spec.file.replace(/\.ts$/, "")}";`);
  }
  lines.push("");
  for (const { spec, ids } of found) {
    lines.push(`export const ${spec.exportName}: ${spec.type}[] = [${ids.map((id) => ident(spec.kind, id)).join(", ")}];`);
  }
  return lines.join("\n") + "\n";
}

// ---------------- Scene đăng nhập (giai đoạn 1) ----------------
export const SCENES_DIR = path.join(ROOT, "src", "features", "login-scene", "scenes");
export const SCENE_REGISTRY_FILE = path.join(SCENES_DIR, "registry.generated.ts");
export const SCENE_LOADERS_FILE = path.join(SCENES_DIR, "draw-loaders.generated.ts");

export type SceneFound = { id: string; hasDraw: boolean; hasCss: boolean };

/** Quét scenes/<id>/: bắt buộc có scene.ts; draw.ts và scene.css là tuỳ chọn. Thư mục bắt đầu bằng "_" hoặc "." bị bỏ qua. */
export function scanScenes(): SceneFound[] {
  if (!existsSync(SCENES_DIR)) return [];
  const ids = readdirSync(SCENES_DIR)
    .filter((n) => !n.startsWith("_") && !n.startsWith(".") && statSync(path.join(SCENES_DIR, n)).isDirectory())
    .sort();
  return ids.map((id) => {
    if (!existsSync(path.join(SCENES_DIR, id, "scene.ts"))) throw new Error(`Thiếu scene.ts trong src/features/login-scene/scenes/${id}/`);
    return { id, hasDraw: existsSync(path.join(SCENES_DIR, id, "draw.ts")), hasCss: existsSync(path.join(SCENES_DIR, id, "scene.css")) };
  });
}

/** Registry NHẸ (chạy được ở server component): import tĩnh scene.ts + scene.css, KHÔNG import draw.ts. */
export function renderSceneRegistry(found: SceneFound[]): string {
  const lines = [
    "// Tệp SINH TỰ ĐỘNG bởi `npm run gen:registry` (chạy trong prebuild). KHÔNG sửa tay.",
    "// Thêm scene = thêm một thư mục trong src/features/login-scene/scenes (xem docs/login-scene.md).",
    'import type { SceneMeta } from "./types";',
  ];
  for (const f of found) {
    lines.push(`import ${ident("scene", f.id)} from "./${f.id}/scene";`);
    if (f.hasCss) lines.push(`import "./${f.id}/scene.css";`);
  }
  lines.push("", `export const SCENES: SceneMeta[] = [${found.map((f) => ident("scene", f.id)).join(", ")}];`);
  return lines.join("\n") + "\n";
}

/** Bộ nạp NẶNG: import động draw.ts. Chỉ client wrapper import tệp này; draw.ts không lọt vào bundle ban đầu. */
export function renderDrawLoaders(found: SceneFound[]): string {
  const lines = [
    "// Tệp SINH TỰ ĐỘNG bởi `npm run gen:registry` (chạy trong prebuild). KHÔNG sửa tay.",
    'import type { SceneDraw } from "./types";',
    "",
    "export const DRAW_LOADERS: Record<string, () => Promise<{ default: SceneDraw }>> = {",
    ...found.filter((f) => f.hasDraw).map((f) => `  "${f.id}": () => import("./${f.id}/draw"),`),
    "};",
  ];
  return lines.join("\n") + "\n";
}
