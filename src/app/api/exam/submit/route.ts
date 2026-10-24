import { postJson } from "@/server/http";
import { examSubmitSchema } from "@/types/api";
import { submitExam } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = postJson(examSubmitSchema, submitExam);
