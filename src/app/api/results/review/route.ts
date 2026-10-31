import { postJson } from "@/server/http";
import { resultRefSchema } from "@/types/api";
import { scheduleWrongWords } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Ôn lại các từ sai": hẹn ôn ngay các từ đã học làm sai trong bài. */
export const POST = postJson(resultRefSchema, (body, userId) => scheduleWrongWords(userId, body));
