import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Test đơn vị (npm test). Alias "@" như tsconfig, để test được mã dùng import "@/…" (server action của admin). */
export default defineConfig({ resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } } });
