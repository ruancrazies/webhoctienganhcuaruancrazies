import { z } from "zod";
import { getQuery } from "@/server/http";
import { getInsights } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hồ sơ năng lực của chính người đang đăng nhập + gợi ý hôm nay. Không nhận id người dùng: luôn là chính mình. */
export const GET = getQuery(z.object({}), () => ({}), (_q, userId) => getInsights(userId));
