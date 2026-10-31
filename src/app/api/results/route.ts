import { getQuery } from "@/server/http";
import { resultsQuerySchema } from "@/types/api";
import { listResults } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Danh sách bài đã nộp của chính người đăng nhập. Query: type, cefr, cursor, limit. */
export const GET = getQuery(
  resultsQuerySchema,
  (p) => ({
    type: p.get("type") ?? undefined,
    cefr: p.get("cefr") ?? undefined,
    cursor: p.get("cursor") ?? undefined,
    limit: p.get("limit") ?? undefined,
  }),
  (q, userId) => listResults(userId, q),
);
