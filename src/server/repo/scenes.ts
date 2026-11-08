import { createAdminClient } from "../db";
import type { SceneConfig, SceneRow, SceneSchedule } from "../../core/loginScene";
import { unwrap, unwrapList } from "./shared";

const db = () => createAdminClient();

type RawScene = { key: string; greeting: string | null; status: "draft" | "published"; pinned: boolean; motion_enabled: boolean };
type RawSchedule = { id: number; scene_key: string; starts_on: string; ends_on: string; priority: number };

const toScene = (r: RawScene): SceneRow => ({ key: r.key, greeting: r.greeting, status: r.status, pinned: r.pinned, motionEnabled: r.motion_enabled });
const toSchedule = (r: RawSchedule): SceneSchedule => ({ id: Number(r.id), sceneKey: r.scene_key, startsOn: r.starts_on, endsOn: r.ends_on, priority: r.priority });

/** Toàn bộ cấu hình Scene (vài dòng): trang đăng nhập đọc cái này rồi chọn bằng resolveSceneKey. */
export async function getSceneConfig(): Promise<SceneConfig> {
  const [scenes, schedules] = await Promise.all([
    db().from("login_scenes").select("key,greeting,status,pinned,motion_enabled"),
    db().from("login_scene_schedules").select("id,scene_key,starts_on,ends_on,priority").order("starts_on"),
  ]);
  return {
    scenes: unwrapList<RawScene>("login_scenes.list", scenes).map(toScene),
    schedules: unwrapList<RawSchedule>("login_scene_schedules.list", schedules).map(toSchedule),
  };
}

export type ScenePatch = { greeting?: string | null; status?: "draft" | "published"; motionEnabled?: boolean };

/** Tạo dòng nếu chưa có rồi áp phần thay đổi. Trả dòng mới. Chuyển về nháp thì tự bỏ ghim (nháp không bao giờ hiển thị). */
export async function upsertScene(key: string, patch: ScenePatch): Promise<SceneRow> {
  const row: Record<string, unknown> = { key, updated_at: new Date().toISOString() };
  if (patch.greeting !== undefined) row.greeting = patch.greeting;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.motionEnabled !== undefined) row.motion_enabled = patch.motionEnabled;
  if (patch.status === "draft") row.pinned = false;
  const r = unwrap<RawScene>("login_scenes.upsert", await db().from("login_scenes").upsert(row, { onConflict: "key" }).select("key,greeting,status,pinned,motion_enabled").single());
  return toScene(r!);
}

/** Ghim một scene (dùng ngay, kể cả ngoài lịch) hoặc null = bỏ ghim. Nguyên tử (rpc). */
export async function setPinnedScene(key: string | null): Promise<void> {
  unwrap("login_scene_set_pin", await db().rpc("login_scene_set_pin", { p_key: key }));
}

/** Thêm một khoảng lịch; tạo dòng scene (nháp) nếu chưa có để khóa ngoại hợp lệ. Trả dòng lịch mới. */
export async function addSchedule(sceneKey: string, startsOn: string, endsOn: string, priority: number): Promise<SceneSchedule> {
  unwrap("login_scenes.ensure", await db().from("login_scenes").upsert({ key: sceneKey }, { onConflict: "key", ignoreDuplicates: true }));
  const r = unwrap<RawSchedule>(
    "login_scene_schedules.add",
    await db().from("login_scene_schedules").insert({ scene_key: sceneKey, starts_on: startsOn, ends_on: endsOn, priority }).select("id,scene_key,starts_on,ends_on,priority").single(),
  );
  return toSchedule(r!);
}

/** Xóa một khoảng lịch của đúng scene đó. Trả dòng đã xóa (null nếu không có). */
export async function deleteSchedule(sceneKey: string, id: number): Promise<SceneSchedule | null> {
  const r = unwrap<RawSchedule[]>(
    "login_scene_schedules.delete",
    await db().from("login_scene_schedules").delete().eq("id", id).eq("scene_key", sceneKey).select("id,scene_key,starts_on,ends_on,priority"),
  );
  return r?.[0] ? toSchedule(r[0]) : null;
}

/** Nhật ký thao tác của admin. */
export async function writeAudit(adminId: string, action: string, target: string, before: unknown, after: unknown): Promise<void> {
  unwrap("admin_audit.insert", await db().from("admin_audit").insert({ admin_id: adminId, action, target, before: before ?? null, after: after ?? null }));
}
