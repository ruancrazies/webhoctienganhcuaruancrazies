import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "content/import/**",
      "content/backup/**",
      "src/types/database.ts",
    ],
  },
  ...tseslint.configs.recommended,
);
