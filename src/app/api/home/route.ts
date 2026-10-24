import { z } from "zod";
import { getQuery } from "@/server/http";
import { getHome } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = getQuery(z.object({}), () => ({}), (_q, userId) => getHome(userId));
