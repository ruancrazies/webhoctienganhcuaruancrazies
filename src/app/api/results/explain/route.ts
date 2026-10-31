import { postJson } from "@/server/http";
import { explainMistake } from "@/server/services";
import { explainSchema } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** POST /api/results/explain { type, id, qid } → { text, source }. Chỉ cho câu SAI trong bài đã nộp của chính người dùng; có giới hạn lượt dùng. */
export const POST = postJson(explainSchema, (b, userId) => explainMistake(userId, { type: b.type, id: b.id }, b.qid));
