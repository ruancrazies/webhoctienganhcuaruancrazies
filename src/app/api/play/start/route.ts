import { postJson } from "@/server/http";
import { startRequestSchema } from "@/types/api";
import { startRound } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = postJson(startRequestSchema, startRound);
