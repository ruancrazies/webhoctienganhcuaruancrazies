import { createAdminClient } from "../db";
import type { BoardRow } from "../../types/api";
import type { Cefr } from "../../core/types";
import { unwrap, unwrapList } from "./shared";

const db = () => createAdminClient();

export type Profile = {
  id: string;
  username: string;
  avatar: string | null;
  xp: number;
  streak: number;
  bestStreak: number;
  lastDay: number | null;
  xpToday: number;
  xpDay: number | null;
};

type Raw = { id: string; username: string; avatar: string | null; xp: number; streak: number; best_streak: number; last_day: number | null; xp_today: number; xp_day: number | null };

export async function getProfile(userId: string): Promise<Profile | null> {
  const r = unwrap<Raw>(
    "profiles.get",
    await db().from("profiles").select("id,username,avatar,xp,streak,best_streak,last_day,xp_today,xp_day").eq("id", userId).maybeSingle(),
  );
  if (!r) return null;
  return {
    id: r.id,
    username: r.username,
    avatar: r.avatar,
    xp: Number(r.xp),
    streak: r.streak,
    bestStreak: r.best_streak,
    lastDay: r.last_day,
    xpToday: r.xp_today,
    xpDay: r.xp_day,
  };
}

/** Top theo XP (index profiles_xp_idx). */
export async function topProfiles(limit: number): Promise<{ id: string; username: string; avatar: string | null; xp: number }[]> {
  const rows = unwrapList<{ id: string; username: string; avatar: string | null; xp: number }>(
    "profiles.top",
    await db().from("profiles").select("id,username,avatar,xp").order("xp", { ascending: false }).limit(limit),
  );
  return rows.map((r) => ({ ...r, xp: Number(r.xp) }));
}

/** Cấp đã qua của một nhóm nhỏ người dùng (bảng xếp hạng: 10 người). */
export async function passesForUsers(userIds: string[]): Promise<Map<string, Set<Cefr>>> {
  const out = new Map<string, Set<Cefr>>(userIds.map((id) => [id, new Set<Cefr>()]));
  if (!userIds.length) return out;
  const rows = unwrapList<{ user_id: string; cefr: Cefr }>("level_passes.forUsers", await db().from("level_passes").select("user_id,cefr").in("user_id", userIds));
  for (const r of rows) out.get(r.user_id)?.add(r.cefr);
  return out;
}

/** Top điểm Blitz của một cấp (index game_scores_board_idx). */
export async function blitzBoard(cefr: Cefr, limit: number): Promise<BoardRow[]> {
  const rows = unwrapList<{ best: number; profiles: { username: string } }>(
    "game_scores.board",
    await db().from("game_scores").select("best,profiles!inner(username)").eq("game", `blitz:${cefr}`).order("best", { ascending: false }).limit(limit),
  );
  return rows.map((r) => ({ username: r.profiles.username, best: r.best }));
}

/** Đổi tên đăng nhập. Vi phạm index duy nhất (không phân biệt hoa thường) → RepoError có code "23505". */
export async function updateUsername(userId: string, username: string): Promise<void> {
  unwrap("profiles.updateUsername", await db().from("profiles").update({ username }).eq("id", userId));
}

/** Đổi avatar (mã trong core/avatars.ts, hoặc null để về chữ cái đầu). */
export async function updateAvatar(userId: string, avatar: string | null): Promise<void> {
  unwrap("profiles.updateAvatar", await db().from("profiles").update({ avatar }).eq("id", userId));
}
