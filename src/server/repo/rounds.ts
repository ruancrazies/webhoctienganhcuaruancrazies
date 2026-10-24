import { createAdminClient } from "../db";
import { RepoError } from "../errors";
import type { BoardRow } from "../../types/api";
import type { Cefr, GameId, StoredItem } from "../../core/types";
import { unwrap } from "./shared";

const db = () => createAdminClient();

/**
 * Nội dung lưu ở game_rounds.items. Bọc thành object (không phải mảng trần) để giữ thêm cấp của vòng:
 * server tự biết vòng chơi thuộc cấp nào (Blitz xếp hạng theo cấp) thay vì tin `level` do client gửi.
 */
export type StoredRound = { v: 1; cefr: Cefr; practice: boolean; items: StoredItem[] };

export type RoundRow = { id: string; game: GameId; createdAt: Date; finishedAt: Date | null; round: StoredRound };

export async function createRound(userId: string, game: GameId, round: StoredRound): Promise<{ id: string; createdAt: Date }> {
  const row = unwrap<{ id: string; created_at: string }>(
    "rounds.create",
    await db().from("game_rounds").insert({ user_id: userId, game, items: round }).select("id,created_at").single(),
  );
  if (!row) throw new RepoError("rounds.create", "không có dòng trả về");
  return { id: row.id, createdAt: new Date(row.created_at) };
}

/**
 * Đọc vòng của đúng người này; null nếu không có / không phải của họ.
 * KHÔNG khóa dòng (PostgREST không có SELECT … FOR UPDATE): chống nộp hai lần do apply_round_result
 * (UPDATE … WHERE finished_at IS NULL) — request thua cuộc đua nhận lỗi 'round_finished_or_invalid'.
 */
export async function getRound(roundId: string, userId: string): Promise<RoundRow | null> {
  const r = unwrap<{ id: string; game: GameId; items: unknown; created_at: string; finished_at: string | null }>(
    "rounds.get",
    await db().from("game_rounds").select("id,game,items,created_at,finished_at").eq("id", roundId).eq("user_id", userId).maybeSingle(),
  );
  if (!r) return null;
  const round = r.items as StoredRound | null;
  if (!round || round.v !== 1 || !Array.isArray(round.items)) return null;
  return { id: r.id, game: r.game, createdAt: new Date(r.created_at), finishedAt: r.finished_at ? new Date(r.finished_at) : null, round };
}

export type RoundPayload = {
  today: number;
  xp: number;
  updates: { word_id: number; level: number; bad: number; next_review: string }[];
  grammar: { level: Cefr; correct: boolean }[];
  blitz: { key: string; score: number } | null;
};
export type RoundOutcome = { xp: number; streak: number; newBest: boolean; board: BoardRow[] | null };

/** RPC apply_round_result: ghi tiến độ + bộ đếm + XP + chuỗi ngày + điểm cao + đóng vòng, MỘT giao dịch. */
export async function applyRoundResult(userId: string, roundId: string, payload: RoundPayload): Promise<RoundOutcome> {
  const { data, error } = await db().rpc("apply_round_result", { p_user: userId, p_round: roundId, p_payload: payload });
  if (error) throw new RepoError("rpc.apply_round_result", error.message, error.code);
  const o = data as { xp: number; streak: number; newBest: boolean; board: BoardRow[] | null };
  return { xp: Number(o.xp), streak: o.streak, newBest: !!o.newBest, board: o.board };
}
