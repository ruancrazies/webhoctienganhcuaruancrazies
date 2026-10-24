import { postJson } from "@/server/http";
import { finishRequestSchema } from "@/types/api";
import { finishRound } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = postJson(finishRequestSchema, finishRound);
