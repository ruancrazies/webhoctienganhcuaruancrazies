import { z } from "zod";
import { getQuery } from "@/server/http";
import { getDailyQuests } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = getQuery(z.object({}), () => ({}), (_q, userId) => getDailyQuests(userId));
