"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";
import { canDo, checkEventEdit, eventPhase, MAX_TASKS_PER_EVENT, publishCheck, windowFromDates } from "@/core/seasonEvents";
import {
  addEventTask, createEvent, deleteEvent, deleteEventTask, duplicateEvent, getEvent, listEventTasks, updateEvent, writeAudit,
} from "@/server/repo";
import { ForbiddenError, UnauthorizedError, requireAdminId } from "@/server/auth/session";
import { hasTag } from "@/server/errors";
import { ADMIN_PER_MINUTE, MINUTE } from "@/server/limits";
import { hitRateLimit } from "@/server/ratelimit";
import { adminCatalog } from "@/server/services";
import { addTaskSchema, createEventSchema, deleteTaskSchema, duplicateEventSchema, eventOpSchema, saveEventSchema } from "@/features/season-events/schemas";
import type { ActionState } from "../scenes/ActionForm";

const firstIssue = (e: ZodError): string => e.issues[0]?.message ?? "Dữ liệu không hợp lệ";
const str = (fd: FormData, k: string): string => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");

/** Lỗi nghiệp vụ của admin: hiện đúng câu này, không ghi log. */
class Fail extends Error {}

/** Lỗi DB → câu tiếng Việt (các bất biến do trigger/ràng buộc của migration 0020 giữ). */
function dbMessage(e: unknown): string | null {
  if (hasTag(e, "event_locked")) return "Sự kiện đã xuất bản nên không sửa nhiệm vụ được.";
  if (hasTag(e, "event_has_progress")) return "Đã có người làm nhiệm vụ nên không thể đưa về nháp.";
  if (hasTag(e, "event_published")) return "Sự kiện đã xuất bản nên không xóa được.";
  if (hasTag(e, "event_not_found")) return "Không tìm thấy sự kiện nguồn.";
  const code = (e as { code?: string }).code;
  if (code === "23505") return hasTag(e, "event_tasks_one_all") ? "Mỗi sự kiện chỉ có một nhiệm vụ “hoàn thành tất cả”." : "Mã này đã được dùng.";
  if (code === "23503") return "Món thưởng chưa được đồng bộ vào DB (chạy npm run cosmetics:sync).";
  return null;
}

/** Khung chung: quyền admin đọc từ DB ở server → giới hạn tốc độ → chạy → làm mới trang quản trị và trang người chơi. */
async function run(fn: (adminId: string) => Promise<string>): Promise<ActionState> {
  let adminId: string;
  try {
    adminId = await requireAdminId();
  } catch (e) {
    if (e instanceof UnauthorizedError) return { error: "Phiên đăng nhập đã hết, hãy đăng nhập lại." };
    if (e instanceof ForbiddenError) return { error: "Bạn không có quyền thực hiện thao tác này." };
    console.error("[admin/events] auth", e);
    return { error: "Hệ thống đang bận, thử lại sau." };
  }
  try {
    if (!(await hitRateLimit(`admin-events:${adminId}`, MINUTE, ADMIN_PER_MINUTE))) return { error: "Bạn thao tác quá nhanh. Thử lại sau ít phút." };
    const ok = await fn(adminId);
    revalidatePath("/admin/events", "layout");
    revalidatePath("/quests");
    return { ok };
  } catch (e) {
    if (e instanceof Fail) return { error: e.message };
    const m = dbMessage(e);
    if (m) return { error: m };
    console.error("[admin/events]", e);
    return { error: "Không lưu được. Thử lại sau." };
  }
}

const must = async (key: string) => {
  const ev = await getEvent(key);
  if (!ev) throw new Fail("Không tìm thấy sự kiện này.");
  return ev;
};

/** Mọi thay đổi sau khi đã xuất bản phải vẫn qua kiểm tra (đổi ngày có thể làm cửa nhận của món không còn bao trọn). */
async function assertPublishable(key: string, next: Parameters<typeof publishCheck>[0], now: Date): Promise<void> {
  const [tasks, catalog] = await Promise.all([listEventTasks([key]), adminCatalog()]);
  const { errors } = publishCheck(next, tasks, catalog, now);
  if (errors.length) throw new Fail(`Chưa thể lưu: ${errors.join(" ")}`);
}

export async function createEventAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const p = createEventSchema.safeParse({ key: str(fd, "key"), name: str(fd, "name"), blurb: str(fd, "blurb"), startsOn: str(fd, "startsOn"), endsOn: str(fd, "endsOn"), claimDays: str(fd, "claimDays") || undefined });
  if (!p.success) return { error: firstIssue(p.error) };
  return run(async (adminId) => {
    const w = windowFromDates(p.data.startsOn, p.data.endsOn);
    const row = await createEvent({ key: p.data.key, name: p.data.name, blurb: p.data.blurb, startsAt: w.startsAt, endsAt: w.endsAt, claimDays: p.data.claimDays });
    await writeAudit(adminId, "event.create", `event:${p.data.key}`, null, row);
    return "Đã tạo sự kiện (nháp). Thêm nhiệm vụ rồi xuất bản.";
  });
}

/** Lưu tên, mô tả, lịch. Phần được sửa phụ thuộc giai đoạn (checkEventEdit). */
export async function saveEventAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const p = saveEventSchema.safeParse({ key: str(fd, "key"), name: str(fd, "name"), blurb: str(fd, "blurb"), startsOn: str(fd, "startsOn"), endsOn: str(fd, "endsOn"), claimDays: str(fd, "claimDays") || undefined });
  if (!p.success) return { error: firstIssue(p.error) };
  return run(async (adminId) => {
    const now = new Date();
    const before = await must(p.data.key);
    const w = windowFromDates(p.data.startsOn, p.data.endsOn);
    const phase = eventPhase(before, now);
    const problem = checkEventEdit(before, { startsAt: w.startsAt, endsAt: w.endsAt, claimDays: p.data.claimDays }, phase, now);
    if (problem) throw new Fail(problem);
    const next = { ...before, name: p.data.name, blurb: p.data.blurb, startsAt: w.startsAt.toISOString(), endsAt: w.endsAt.toISOString(), claimDays: p.data.claimDays };
    if (before.status === "published") await assertPublishable(before.key, next, now);
    const after = await updateEvent(p.data.key, { name: p.data.name, blurb: p.data.blurb, startsAt: w.startsAt, endsAt: w.endsAt, claimDays: p.data.claimDays });
    await writeAudit(adminId, "event.save", `event:${p.data.key}`, before, after);
    return "Đã lưu.";
  });
}

/** Xuất bản / bỏ xuất bản / kết thúc sớm / xóa nháp. */
export async function eventOpAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const p = eventOpSchema.safeParse({ key: str(fd, "key"), op: str(fd, "op") });
  if (!p.success) return { error: firstIssue(p.error) };
  return run(async (adminId) => {
    const now = new Date();
    const before = await must(p.data.key);
    const phase = eventPhase(before, now);
    if (!canDo(p.data.op, phase)) throw new Fail("Thao tác này không dùng được ở giai đoạn hiện tại của sự kiện.");
    const target = `event:${p.data.key}`;
    switch (p.data.op) {
      case "publish": {
        await assertPublishable(before.key, before, now);
        const after = await updateEvent(before.key, { status: "published" });
        await writeAudit(adminId, "event.publish", target, before, after);
        return "Đã xuất bản. Người chơi thấy sự kiện theo lịch.";
      }
      case "unpublish": {
        const after = await updateEvent(before.key, { status: "draft" });
        await writeAudit(adminId, "event.unpublish", target, before, after);
        return "Đã đưa về nháp.";
      }
      case "end": {
        const after = await updateEvent(before.key, { endsAt: now });
        await writeAudit(adminId, "event.end", target, before, after);
        return "Đã kết thúc sớm. Người chơi vẫn nhận được thưởng trong thời gian nhận thưởng.";
      }
      default: {
        const row = await deleteEvent(before.key);
        await writeAudit(adminId, "event.delete", target, row ?? before, null);
        return "Đã xóa sự kiện nháp.";
      }
    }
  });
}

export async function duplicateEventAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const p = duplicateEventSchema.safeParse({ key: str(fd, "key"), newKey: str(fd, "newKey"), startsOn: str(fd, "startsOn"), endsOn: str(fd, "endsOn") });
  if (!p.success) return { error: firstIssue(p.error) };
  return run(async (adminId) => {
    await must(p.data.key);
    const w = windowFromDates(p.data.startsOn, p.data.endsOn);
    await duplicateEvent(p.data.key, p.data.newKey, w.startsAt, w.endsAt);
    await writeAudit(adminId, "event.duplicate", `event:${p.data.newKey}`, { from: p.data.key }, { startsOn: p.data.startsOn, endsOn: p.data.endsOn });
    return `Đã tạo “${p.data.newKey}” (nháp) từ “${p.data.key}”. Kiểm tra lịch và món thưởng rồi xuất bản.`;
  });
}

export async function addTaskAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const p = addTaskSchema.safeParse({ key: str(fd, "key"), metric: str(fd, "metric"), target: str(fd, "target"), title: str(fd, "title"), rewardXp: str(fd, "rewardXp") || "0", rewardCosmetic: str(fd, "rewardCosmetic") });
  if (!p.success) return { error: firstIssue(p.error) };
  return run(async (adminId) => {
    const ev = await must(p.data.key);
    if (ev.status === "published") throw new Fail("Sự kiện đã xuất bản nên không sửa nhiệm vụ được.");
    const existing = await listEventTasks([ev.key]);
    if (existing.length >= MAX_TASKS_PER_EVENT) throw new Fail(`Tối đa ${MAX_TASKS_PER_EVENT} nhiệm vụ một sự kiện.`);
    const sort = existing.reduce((m, t) => Math.max(m, t.sort), 0) + 1;
    const row = await addEventTask({ eventKey: ev.key, metric: p.data.metric, target: p.data.target, title: p.data.title, rewardXp: p.data.rewardXp, rewardCosmetic: p.data.rewardCosmetic, sort });
    await writeAudit(adminId, "event.task.add", `event:${ev.key}`, null, row);
    return "Đã thêm nhiệm vụ.";
  });
}

export async function deleteTaskAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const p = deleteTaskSchema.safeParse({ key: str(fd, "key"), id: str(fd, "id") });
  if (!p.success) return { error: firstIssue(p.error) };
  return run(async (adminId) => {
    const ev = await must(p.data.key);
    if (ev.status === "published") throw new Fail("Sự kiện đã xuất bản nên không sửa nhiệm vụ được.");
    const row = await deleteEventTask(ev.key, p.data.id);
    if (!row) return "Nhiệm vụ này đã được xóa trước đó.";
    await writeAudit(adminId, "event.task.delete", `event:${ev.key}`, row, null);
    return "Đã xóa nhiệm vụ.";
  });
}
