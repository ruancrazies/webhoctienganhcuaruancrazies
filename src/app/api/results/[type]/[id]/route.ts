import { getQuery } from "@/server/http";
import { resultRefSchema } from "@/types/api";
import { getResultDetail } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Chi tiết một bài đã nộp (đề, đáp án đã chọn, đáp án đúng, giải thích). Bài của người khác: 404. */
export async function GET(req: Request, ctx: { params: Promise<{ type: string; id: string }> }): Promise<Response> {
  const params = await ctx.params;
  return getQuery(resultRefSchema, () => params, (ref, userId) => getResultDetail(userId, ref))(req);
}
