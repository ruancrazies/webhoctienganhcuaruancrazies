"use server";

import { revalidatePath, updateTag } from "next/cache";
import type { ZodError } from "zod";
import { ForbiddenError, UnauthorizedError, requireAdminId } from "@/server/auth/session";
import { addSchedule, deleteSchedule, getSceneConfig, setPinnedScene, upsertScene, writeAudit } from "@/server/repo";
import { hitRateLimit } from "@/server/ratelimit";
import { MINUTE } from "@/server/limits";
import { SCENES_TAG } from "@/features/login-scene/getActiveScene";
import { deleteScheduleSchema, pinSchema, saveSceneSchema, scheduleSchema } from "@/features/login-scene/schemas";
import type { ActionState } from "./ActionForm";

const ADMIN_PER_MINUTE = 30;

const firstIssue = (e: ZodError): string => e.issues[0]?.message ?? "Dữ liệu không hợp lệ";
const str = (fd: FormData, k: string): string => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");

/**
 * Khung chung của mọi thao tác: quyền admin đọc từ DB ở server (không tin client) → giới hạn tốc độ → chạy → ghi nhật ký
 * → xóa cache (updateTag) để đổi Scene có hiệu lực ngay, rồi làm mới trang quản trị.
 */
async function run(fn: (adminId: string) => Promise<string>): Promise<ActionState> {
  let adminId: string;
  try {
    adminId = await requireAdminId();
  } catch (e) {
    if (e instanceof UnauthorizedError) return { error: "Phiên đăng nhập đã hết, hãy đăng nhập lại." };
    if (e instanceof ForbiddenError) return { error: "Bạn không có quyền thực hiện thao tác này." };
    console.error("[admin/scenes] auth", e);
    return { error: "Hệ thống đang bận, thử lại sau." };
  }
  try {
    if (!(await hitRateLimit(`admin-scenes:${adminId}`, MINUTE, ADMIN_PER_MINUTE))) return { error: "Bạn thao tác quá nhanh. Thử lại sau ít phút." };
    const ok = await fn(adminId);
    updateTag(SCENES_TAG);
    revalidatePath("/admin/scenes", "layout");
    return { ok };
  } catch (e) {
    console.error("[admin/scenes]", e);
    return { error: "Không lưu được. Thử lại sau." };
  }
}

/** Lưu câu chào, trạng thái (nháp/xuất bản) và bật/tắt hiệu ứng canvas của một scene. */
export async function saveSceneAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const p = saveSceneSchema.safeParse({ key: str(fd, "key"), greeting: str(fd, "greeting"), status: str(fd, "status"), motionEnabled: fd.get("motionEnabled") === "on" });
  if (!p.success) return { error: firstIssue(p.error) };
  return run(async (adminId) => {
    const before = (await getSceneConfig()).scenes.find((s) => s.key === p.data.key) ?? null;
    const after = await upsertScene(p.data.key, { greeting: p.data.greeting, status: p.data.status, motionEnabled: p.data.motionEnabled });
    await writeAudit(adminId, "scene.save", `scene:${p.data.key}`, before, after);
    return "Đã lưu. Trang đăng nhập đổi trong vài giây.";
  });
}

/** Ghim = dùng ngay, kể cả ngoài lịch. Bỏ ghim thì quay về theo lịch/mặc định. */
export async function pinSceneAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const p = pinSchema.safeParse({ key: str(fd, "key"), pin: str(fd, "pin") === "1" });
  if (!p.success) return { error: firstIssue(p.error) };
  return run(async (adminId) => {
    const before = (await getSceneConfig()).scenes.find((s) => s.pinned)?.key ?? null;
    await setPinnedScene(p.data.pin ? p.data.key : null);
    await writeAudit(adminId, p.data.pin ? "scene.pin" : "scene.unpin", `scene:${p.data.key}`, { pinned: before }, { pinned: p.data.pin ? p.data.key : null });
    return p.data.pin ? "Đã dùng ngay scene này." : "Đã bỏ ghim. Trang đăng nhập theo lịch.";
  });
}

export async function addScheduleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const p = scheduleSchema.safeParse({ key: str(fd, "key"), startsOn: str(fd, "startsOn"), endsOn: str(fd, "endsOn"), priority: str(fd, "priority") || "0" });
  if (!p.success) return { error: firstIssue(p.error) };
  return run(async (adminId) => {
    const row = await addSchedule(p.data.key, p.data.startsOn, p.data.endsOn, p.data.priority);
    await writeAudit(adminId, "scene.schedule.add", `scene:${p.data.key}`, null, row);
    return "Đã thêm lịch (giờ Việt Nam).";
  });
}

export async function deleteScheduleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const p = deleteScheduleSchema.safeParse({ key: str(fd, "key"), id: str(fd, "id") });
  if (!p.success) return { error: firstIssue(p.error) };
  return run(async (adminId) => {
    const row = await deleteSchedule(p.data.key, p.data.id);
    if (!row) return "Lịch này đã được xóa trước đó.";
    await writeAudit(adminId, "scene.schedule.delete", `scene:${p.data.key}`, row, null);
    return "Đã xóa lịch.";
  });
}
