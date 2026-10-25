import { postJson } from "@/server/http";
import { practiceSubmitSchema } from "@/types/api";
import { submitPractice } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = postJson(practiceSubmitSchema, (body, userId) => submitPractice(body, userId));
