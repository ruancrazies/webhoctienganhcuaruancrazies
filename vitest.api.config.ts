import path from "node:path";
import { defineConfig } from "vitest/config";

/** Test tích hợp bước 4: chạy trên Supabase LOCAL thật (npm run test:api). Không nằm trong `npm test`. */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/api/server-only-stub.ts"),
    },
  },
  test: {
    include: ["tests/api/**/*.itest.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
