import { getQuery } from "@/server/http";
import { getCoach } from "@/server/services";
import { coachQuerySchema } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Lời nhắn coach hôm nay của chính người đang đăng nhập (không nhận id). Luôn trả 200: Gemini lỗi thì là câu theo luật (`source: "rule"`). */
export const GET = getQuery(coachQuerySchema, (p) => ({ ai: p.get("ai") ?? undefined }), (q, userId) => getCoach(userId, q.ai === "1"));
