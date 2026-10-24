import { getQuery } from "@/server/http";
import { listLearn } from "@/server/services";
import { learnQuerySchema } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/learn/words?topic=food-drink&cursor=…            (theo chủ đề)
 * GET /api/learn/words?cefr=B2&domain=general&cursor=…      (theo cấp; domain mặc định "all")
 */
export const GET = getQuery(
  learnQuerySchema,
  (p) => {
    const topic = p.get("topic");
    return {
      scope: topic ? { by: "topic", topicSlug: topic } : { by: "level", cefr: p.get("cefr") ?? undefined, domain: p.get("domain") ?? undefined },
      cursor: p.get("cursor") ?? undefined,
    };
  },
  listLearn,
);
