import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { ExamConfig } from "../core/exam";
import type { LevelsConfig } from "../core/levels";
import { CEFR_ORDER, type Cefr } from "../core/types";

/**
 * Đọc content/taxonomy/levels.yml (mục 4.3, 4.6) một lần cho mỗi tiến trình.
 * LƯU Ý Vercel: file này phải được đóng gói cùng hàm serverless → thêm vào next.config.ts:
 *   outputFileTracingIncludes: { "/api/**": ["./content/taxonomy/levels.yml"] }
 */
const cefrKeys = Object.fromEntries(CEFR_ORDER.map((c) => [c, z.number().int().nonnegative().optional()])) as Record<
  Cefr,
  z.ZodOptional<z.ZodNumber>
>;

const fileSchema = z.object({
  examMinWords: z.object(cefrKeys),
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
    passTotal: z.number().min(0).max(1),
    passPart: z.number().min(0).max(1),
    cooldownMinutes: z.number().nonnegative(),
    maxAttemptsPerDay: z.number().int().positive(),
  }),
});

export type AppConfig = { levels: LevelsConfig; exam: ExamConfig };

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (cached) return cached;
  const file = path.join(process.cwd(), "content", "taxonomy", "levels.yml");
  const parsed = fileSchema.parse(parse(readFileSync(file, "utf8")));
  cached = { levels: { examMinWords: parsed.examMinWords }, exam: parsed.exam };
  return cached;
}

/** Cho test: thay cấu hình (hoặc truyền undefined để đọc lại từ file). */
export function setConfigForTest(cfg: AppConfig | undefined): void {
  cached = cfg;
}
