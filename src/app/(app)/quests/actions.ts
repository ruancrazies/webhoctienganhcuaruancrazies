"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { ServiceError } from "@/server/errors";
import { claimEventTask } from "@/server/services";

const BUSY = "Hệ thống đang bận, vui lòng thử lại sau.";
const schema = z.object({ taskId: z.number().int().positive() });

export type ClaimEventActionResult =
  | { ok: true; taskId: number; rewardXp: number; xp: number; cosmetic: { id: string; name: string; kind: "theme" | "avatar" | "frame"; granted: boolean } | null }
  | { ok: false; error: string };

/** Nhận thưởng một nhiệm vụ sự kiện. Mọi kiểm tra (đủ tiến độ, còn hạn nhận, chưa nhận) do server/DB làm; client chỉ gửi mã nhiệm vụ. */
export async function claimEventTaskAction(input: { taskId: number }): Promise<ClaimEventActionResult> {
  const user = await requireUser();
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: "Yêu cầu không hợp lệ." };
  try {
    const r = await claimEventTask(user.id, p.data.taskId);
    revalidatePath("/", "layout"); // XP/level ở khung, khung avatar mới
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false, error: e.message };
    console.error("[quests:event-claim]", e);
    return { ok: false, error: BUSY };
  }
}
