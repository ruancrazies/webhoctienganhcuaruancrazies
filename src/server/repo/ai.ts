import { createAdminClient } from "../db";
import { RepoError } from "../errors";
import { unwrap } from "./shared";

const db = () => createAdminClient();

// ---------- coach hằng ngày ----------

export type CoachRow = { message: string; source: "ai" | "rule"; fingerprint: string };

export async function getCoachRow(userId: string, day: number): Promise<CoachRow | null> {
  return unwrap<CoachRow>(
    "coach.get",
    await db().from("coach_messages").select("message,source,fingerprint").eq("user_id", userId).eq("day", day).maybeSingle(),
  );
}

/** Ghi đè lời nhắn của ngày (gợi ý đổi trong ngày thì viết lại). */
export async function saveCoachRow(userId: string, day: number, row: CoachRow): Promise<void> {
  const { error } = await db().from("coach_messages").upsert({ user_id: userId, day, ...row }, { onConflict: "user_id,day" });
  if (error) throw new RepoError("coach.save", error.message, error.code);
}

// ---------- giải thích lỗi (dùng chung) ----------

export async function getErrorExplanation(key: string): Promise<string | null> {
  const r = unwrap<{ text: string }>("explain.get", await db().from("error_explanations").select("text").eq("cache_key", key).maybeSingle());
  return r?.text ?? null;
}

/** Hai người cùng lỗi cùng lúc: người sau không ghi đè người trước (ignoreDuplicates). */
export async function saveErrorExplanation(key: string, text: string): Promise<void> {
  const { error } = await db().from("error_explanations").upsert({ cache_key: key, text }, { onConflict: "cache_key", ignoreDuplicates: true });
  if (error) throw new RepoError("explain.save", error.message, error.code);
}
