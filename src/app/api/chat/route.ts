import { postJson } from "@/server/http";
import { chatWithPet } from "@/server/services";
import { chatSchema } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** POST /api/chat { pet, message, history? } → { reply }. Cần đăng nhập, có giới hạn lượt dùng. */
export const POST = postJson(chatSchema, chatWithPet);
