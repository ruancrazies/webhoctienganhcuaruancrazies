import { createAdminClient } from "../db";
import { RepoError } from "../errors";
import { PRACTICE_POOL_MAX } from "../../core/rules";
import type { StoredItem } from "../../core/types";
import { unwrap, unwrapList } from "./shared";

const db = () => createAdminClient();

export type PracticeRow = { id: string; items: StoredItem[]; startedAt: Date; expiresAt: Date; finishedAt: Date | null };
type Raw = { id: string; items: StoredItem[]; started_at: string; expires_at: string; finished_at: string | null };
const COLS = "id,items,started_at,expires_at,finished_at";

const toRow = (r: Raw): PracticeRow => ({
  id: r.id,
  items: r.items,
  startedAt: new Date(r.started_at),
  expiresAt: new Date(r.expires_at),
  finishedAt: r.finished_at ? new Date(r.finished_at) : null,
});

/** Bài đang dở (finished_at IS NULL) — tối đa một bài/người nhờ unique partial index. */
export async function activePractice(userId: string): Promise<PracticeRow | null> {
  const r = unwrap<Raw>("practice.active", await db().from("practice_tests").select(COLS).eq("user_id", userId).is("finished_at", null).limit(1).maybeSingle());
  return r ? toRow(r) : null;
}

export async function getPractice(testId: string, userId: string): Promise<PracticeRow | null> {
  const r = unwrap<Raw>("practice.get", await db().from("practice_tests").select(COLS).eq("id", testId).eq("user_id", userId).maybeSingle());
  return r ? toRow(r) : null;
}

/** Hai request song song: unique partial index khiến request thứ hai ném RepoError code "23505". */
export async function createPractice(userId: string, items: StoredItem[], expiresAt: Date): Promise<PracticeRow> {
  const r = unwrap<Raw>(
    "practice.create",
    await db().from("practice_tests").insert({ user_id: userId, items, expires_at: expiresAt.toISOString() }).select(COLS).single(),
  );
  if (!r) throw new RepoError("practice.create", "không có dòng trả về");
  return toRow(r);
}

export async function failPractice(userId: string, testId: string): Promise<boolean> {
  const { data, error } = await db().rpc("fail_practice_test", { p_user: userId, p_test: testId });
  if (error) throw new RepoError("rpc.fail_practice_test", error.message, error.code);
  return data === true;
}

export type PracticePayload = { total: number; vocab: number; grammar: number; reading?: number; listening?: number; today: number; wrongWords: number[] };

/** RPC apply_practice_result: đóng bài + ghi điểm + hẹn ôn từ sai + chuỗi ngày, một giao dịch. */
export async function applyPracticeResult(userId: string, testId: string, payload: PracticePayload): Promise<{ streak: number }> {
  const { data, error } = await db().rpc("apply_practice_result", { p_user: userId, p_test: testId, p_payload: payload });
  if (error) throw new RepoError("rpc.apply_practice_result", error.message, error.code);
  return data as { streak: number };
}

export type PracticeScore = { finishedAt: string; total: number; vocab: number; grammar: number; reading: number | null; listening: number | null };

/** Các bài đã nộp gần nhất (có điểm), mới nhất trước. Bài bị đóng vì hết giờ không có điểm nên không xuất hiện. */
export async function recentPracticeResults(userId: string, limit: number): Promise<PracticeScore[]> {
  const rows = unwrapList<{ finished_at: string; score_total: number | string; score_vocab: number | string; score_grammar: number | string; score_reading: number | string | null; score_listening: number | string | null }>(
    "practice.recent",
    await db()
      .from("practice_tests")
      .select("finished_at,score_total,score_vocab,score_grammar,score_reading,score_listening")
      .eq("user_id", userId)
      .not("score_total", "is", null)
      .order("finished_at", { ascending: false })
      .limit(limit),
  );
  return rows.map((r) => ({ finishedAt: r.finished_at, total: Number(r.score_total), vocab: Number(r.score_vocab), grammar: Number(r.score_grammar),
    reading: r.score_reading === null ? null : Number(r.score_reading),
    listening: r.score_listening === null ? null : Number(r.score_listening),
  }));
}

/** Id các từ ĐÃ HỌC (level ≥ 1) của người dùng — nguồn đề của bài kiểm tra. Tối đa PRACTICE_POOL_MAX. */
export async function learnedWordIds(userId: string): Promise<number[]> {
  const rows = unwrapList<{ word_id: number }>(
    "progress.learnedIds",
    await db().from("user_word_progress").select("word_id").eq("user_id", userId).gte("level", 1).limit(PRACTICE_POOL_MAX),
  );
  return rows.map((r) => r.word_id);
}
