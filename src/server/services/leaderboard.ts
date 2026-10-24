import { highestPassedLevel } from "../../core/levels";
import type { Cefr } from "../../core/types";
import type { BlitzBoardResponse, LeaderboardResponse } from "../../types/api";
import { blitzBoard, passesForUsers, topProfiles } from "../repo";
import { nowOf, type Ctx } from "./ctx";

const TOP_N = 10;
const BLITZ_TOP_N = 5;
const TTL_MS = 60_000;

type Entry = { id: string; username: string; xp: number; level: Cefr | null };
let cache: { at: number; rows: Entry[] } | undefined;
const blitzCache = new Map<Cefr, { at: number; rows: BlitzBoardResponse["rows"] }>();

/**
 * Top 10 theo XP + cấp cao nhất đã qua liên tiếp từ A1 (mục 4.4, 6.1). Cache 60 giây TRONG BỘ NHỚ tiến trình:
 * chỉ là tối ưu best-effort (serverless: mỗi instance một bản, mất khi instance bị thu hồi) — sai lệch tối đa ~60 giây là chấp nhận được.
 * `isMe` tính SAU cache nên không lộ ai là ai giữa các người dùng.
 */
export async function getLeaderboard(userId: string, ctx: Ctx = {}): Promise<LeaderboardResponse> {
  const t = nowOf(ctx).getTime();
  if (!cache || t - cache.at > TTL_MS || t < cache.at) {
    const top = await topProfiles(TOP_N);
    const passes = await passesForUsers(top.map((p) => p.id));
    cache = { at: t, rows: top.map((p) => ({ ...p, level: highestPassedLevel(passes.get(p.id) ?? new Set()) })) };
  }
  return {
    rows: cache.rows.map((r, i) => ({ rank: i + 1, username: r.username, xp: r.xp, level: r.level, isMe: r.id === userId })),
  };
}

/** Top 5 điểm Blitz của một cấp (cache 60 giây như trên). */
export async function getBlitzBoard(cefr: Cefr, ctx: Ctx = {}): Promise<BlitzBoardResponse> {
  const t = nowOf(ctx).getTime();
  const hit = blitzCache.get(cefr);
  if (hit && t - hit.at <= TTL_MS && t >= hit.at) return { cefr, rows: hit.rows };
  const rows = await blitzBoard(cefr, BLITZ_TOP_N);
  blitzCache.set(cefr, { at: t, rows });
  return { cefr, rows };
}

/** Cho test: xóa cache. */
export function clearLeaderboardCache(): void {
  cache = undefined;
  blitzCache.clear();
}
