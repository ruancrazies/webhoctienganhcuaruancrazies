import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { CEFR } from "./constants";

// ---------- content/sheet.config.json ----------

const TabRef = z.object({
  name: z.string().min(1),
  /** gid của tab (số sau `gid=` trên URL). Để null thì tải theo tên tab. */
  gid: z.union([z.string(), z.number()]).nullable().optional(),
});

export const SheetConfigSchema = z.object({
  sheetId: z.string().min(1),
  wordTabs: z.array(TabRef.extend({ name: z.enum(CEFR) })).min(1),
  otherTabs: z.object({
    sentences: TabRef,
    grammar: TabRef,
    topics: TabRef,
    domains: TabRef,
    // Có mặc định để sheet.config.json cũ (chưa khai báo hai tab này) vẫn nạp được.
    passages: TabRef.default({ name: "passages" }),
    passageQuestions: TabRef.default({ name: "passage_questions" }),
    // Tab bài đọc riêng (cột khác `passages`). Tùy chọn: không có trên Sheet thì bỏ qua.
    reading: TabRef.default({ name: "reading" }),
    readingQuestions: TabRef.default({ name: "reading_questions" }),
  }),
});
export type SheetConfig = z.infer<typeof SheetConfigSchema>;

export function loadSheetConfig(root = process.cwd()): SheetConfig {
  const file = path.join(root, "content", "sheet.config.json");
  const cfg = SheetConfigSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  const fromEnv = process.env.CONTENT_SHEET_ID?.trim();
  return fromEnv ? { ...cfg, sheetId: fromEnv } : cfg;
}

// ---------- content/taxonomy/levels.yml ----------

const GatedLevel = z.enum(["A1", "A2", "B1", "B2", "C1"]);

export const LevelsSchema = z
  .object({
    /** Số từ general đã học, cộng dồn từ A1, tối thiểu để được thi cấp đó (mục 4.3). */
    examMinWords: z.record(GatedLevel, z.number().int().positive()),
    exam: z.object({
      vocab: z.object({
        total: z.number().int().positive(),
        mix: z.object({
          quiz: z.number().int().nonnegative(),
          cloze: z.number().int().nonnegative(),
          type: z.number().int().nonnegative(),
        }),
      }),
      grammar: z.object({ total: z.number().int().positive() }),
      passages: z.object({ reading: z.number().int().nonnegative(), listening: z.number().int().nonnegative() }).optional(),
      durationMinutes: z.number().positive(),
      passTotal: z.number().gt(0).lte(1),
      passPart: z.number().gt(0).lte(1),
      cooldownMinutes: z.number().int().nonnegative(),
      maxAttemptsPerDay: z.number().int().positive(),
    }),
  })
  .refine(
    (l) => l.exam.vocab.mix.quiz + l.exam.vocab.mix.cloze + l.exam.vocab.mix.type === l.exam.vocab.total,
    { message: "exam.vocab.mix phải cộng đúng bằng exam.vocab.total" },
  );
export type Levels = z.infer<typeof LevelsSchema>;

export function loadLevels(root = process.cwd()): Levels {
  const file = path.join(root, "content", "taxonomy", "levels.yml");
  if (!existsSync(file)) throw new Error(`Không thấy ${file}`);
  return LevelsSchema.parse(parseYaml(readFileSync(file, "utf8")));
}
