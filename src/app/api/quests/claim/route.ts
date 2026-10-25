import { postJson } from "@/server/http";
import { claimQuestSchema } from "@/types/api";
import { claimQuest } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = postJson(claimQuestSchema, (body, userId) => claimQuest(body, userId));
