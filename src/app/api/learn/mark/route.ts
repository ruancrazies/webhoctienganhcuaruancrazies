import { postJson } from "@/server/http";
import { markLearnedSchema } from "@/types/api";
import { markLearned } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = postJson(markLearnedSchema, markLearned);
