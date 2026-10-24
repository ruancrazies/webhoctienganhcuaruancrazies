import { z } from "zod";
import { getQuery } from "@/server/http";
import { getBlitzBoard, getLeaderboard } from "@/server/services";
import { cefrSchema } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/leaderboard → top 10 XP;  GET /api/leaderboard?blitz=B1 → top 5 Blitz của cấp đó. */
const schema = z.object({ blitz: cefrSchema.optional() });

export const GET = getQuery(
  schema,
  (p) => ({ blitz: p.get("blitz") ?? undefined }),
  (q, userId) => (q.blitz ? getBlitzBoard(q.blitz) : getLeaderboard(userId)),
);
