import { createAdminClient } from "../db";
import { RepoError } from "../errors";
import { ALL_QUESTS, type QuestDelta, type QuestId, type QuestRow } from "../../core/quests";
import { unwrapList } from "./shared";

const db = () => createAdminClient();

type Raw = { quest: string; progress: number; target: number; reward: number; claimed_at: string | null };

/** Các dòng nhiệm vụ của một ngày (có thể rỗng nếu ngày đó chưa làm gì). */
export async function questRows(userId: string, day: number): Promise<QuestRow[]> {
  const rows = unwrapList<Raw>(
    "quests.rows",
    await db().from("daily_quests").select("quest,progress,target,reward,claimed_at").eq("user_id", userId).eq("day", day),
  );
  return rows.map((r) => ({ quest: r.quest, progress: r.progress, target: r.target, reward: r.reward, claimed: r.claimed_at !== null }));
}

/** RPC bump_quests: tạo dòng của ngày (nếu chưa có) và tăng tiến độ trong MỘT giao dịch. */
export async function bumpQuests(userId: string, day: number, delta: QuestDelta): Promise<void> {
  const defs = ALL_QUESTS.map((q) => ({ quest: q.id, target: q.target, reward: q.reward }));
  const { error } = await db().rpc("bump_quests", {
    p_user: userId,
    p_day: day,
    p_defs: defs,
    p_learn: delta.learn,
    p_review: delta.review,
    p_play: delta.play,
  });
  if (error) throw new RepoError("rpc.bump_quests", error.message, error.code);
}

/** RPC claim_quest. Ném RepoError có message chứa quest_not_found / quest_not_ready / quest_already_claimed. */
export async function claimQuestRpc(userId: string, day: number, quest: QuestId): Promise<{ reward: number; xp: number }> {
  const { data, error } = await db().rpc("claim_quest", { p_user: userId, p_day: day, p_quest: quest });
  if (error) throw new RepoError("rpc.claim_quest", error.message, error.code);
  const d = data as { reward: number; xp: number | string };
  return { reward: Number(d.reward), xp: Number(d.xp) };
}
