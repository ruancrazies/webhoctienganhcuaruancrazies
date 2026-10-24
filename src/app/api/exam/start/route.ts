import { postJson } from "@/server/http";
import { examStartSchema } from "@/types/api";
import { startExam } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = postJson(examStartSchema, startExam);
