import { postJson } from "@/server/http";
import { practiceStartSchema } from "@/types/api";
import { startPractice } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = postJson(practiceStartSchema, (_body, userId) => startPractice(userId));
