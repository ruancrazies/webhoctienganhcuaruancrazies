import { postJson } from "@/server/http";
import { markReviewedSchema } from "@/types/api";
import { markReviewed } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = postJson(markReviewedSchema, markReviewed);
