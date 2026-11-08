import { createAdminClient } from "../db";
import { RepoError } from "../errors";
import type { QuestDelta } from "../../core/quests";
import type { EventMetric, EventRow, EventStatus, EventTask, ProgressRow } from "../../core/seasonEvents";
import { unwrap, unwrapList } from "./shared";

const db = () => createAdminClient();

type RawEvent = { key: string; name: string; blurb: string | null; starts_at: string; ends_at: string; claim_days: number; status: EventStatus };
type RawTask = { id: number | string; event_key: string; metric: EventMetric; target: number; title: string | null; reward_xp: number; reward_cosmetic: string | null; sort: number };

const EVENT_COLS = "key,name,blurb,starts_at,ends_at,claim_days,status";
const TASK_COLS = "id,event_key,metric,target,title,reward_xp,reward_cosmetic,sort";

const toEvent = (r: RawEvent): EventRow => ({ key: r.key, name: r.name, blurb: r.blurb, startsAt: r.starts_at, endsAt: r.ends_at, claimDays: r.claim_days, status: r.status });
const toTask = (r: RawTask): EventTask => ({
  id: Number(r.id), eventKey: r.event_key, metric: r.metric, target: r.target, title: r.title, rewardXp: r.reward_xp, rewardCosmetic: r.reward_cosmetic, sort: r.sort,
});

// ---------------- đọc ----------------

/** Mọi đợt (trang quản trị), mới nhất trước. */
export async function listEvents(): Promise<EventRow[]> {
  return unwrapList<RawEvent>("seasonal_events.list", await db().from("seasonal_events").select(EVENT_COLS).order("starts_at", { ascending: false })).map(toEvent);
}

/** Các đợt đã xuất bản mà thời điểm kết thúc từ `since` trở đi (người chơi: lọc tiếp theo giai đoạn ở lớp trên). */
export async function listPublishedEventsEndingAfter(since: Date): Promise<EventRow[]> {
  return unwrapList<RawEvent>(
    "seasonal_events.published",
    await db().from("seasonal_events").select(EVENT_COLS).eq("status", "published").gte("ends_at", since.toISOString()).order("starts_at"),
  ).map(toEvent);
}

export async function getEvent(key: string): Promise<EventRow | null> {
  const r = unwrap<RawEvent>("seasonal_events.get", await db().from("seasonal_events").select(EVENT_COLS).eq("key", key).maybeSingle());
  return r ? toEvent(r) : null;
}

/** Nhiệm vụ của các đợt đã cho (theo thứ tự hiển thị). */
export async function listEventTasks(eventKeys: string[]): Promise<EventTask[]> {
  if (!eventKeys.length) return [];
  return unwrapList<RawTask>("event_tasks.list", await db().from("event_tasks").select(TASK_COLS).in("event_key", eventKeys).order("sort").order("id")).map(toTask);
}

export async function getEventTask(id: number): Promise<EventTask | null> {
  const r = unwrap<RawTask>("event_tasks.get", await db().from("event_tasks").select(TASK_COLS).eq("id", id).maybeSingle());
  return r ? toTask(r) : null;
}

/** Tiến độ của một người trên các nhiệm vụ đã cho. */
export async function listEventProgress(userId: string, taskIds: number[]): Promise<ProgressRow[]> {
  if (!taskIds.length) return [];
  const rows = unwrapList<{ task_id: number | string; progress: number; claimed_at: string | null }>(
    "event_progress.list",
    await db().from("event_progress").select("task_id,progress,claimed_at").eq("user_id", userId).in("task_id", taskIds),
  );
  return rows.map((r) => ({ taskId: Number(r.task_id), progress: r.progress, claimed: r.claimed_at !== null }));
}

export type EventStat = { participants: number; claims: number };

/** Số người tham gia / lượt nhận thưởng mỗi đợt (đợt chưa ai chơi không có mục). */
export async function eventStats(keys: string[]): Promise<Map<string, EventStat>> {
  const out = new Map<string, EventStat>();
  if (!keys.length) return out;
  const rows = unwrapList<{ event_key: string; participants: number | string; claims: number | string }>("event_stats", await db().rpc("event_stats", { p_keys: keys }));
  for (const r of rows) out.set(r.event_key, { participants: Number(r.participants), claims: Number(r.claims) });
  return out;
}

// ---------------- tiến độ + nhận thưởng ----------------

/** RPC bump_event_progress: cộng tiến độ cho mọi nhiệm vụ khớp của các sự kiện đang diễn ra tại `now`. */
export async function bumpEventProgress(userId: string, now: Date, delta: QuestDelta): Promise<void> {
  const { error } = await db().rpc("bump_event_progress", {
    p_user: userId, p_now: now.toISOString(), p_learn: delta.learn, p_review: delta.review, p_play: delta.play, p_test: delta.test,
  });
  if (error) throw new RepoError("rpc.bump_event_progress", error.message, error.code);
}

export type EventClaim = { rewardXp: number; xp: number; cosmetic: string | null; granted: boolean };

/**
 * RPC claim_event_task (một giao dịch). Ném RepoError có message chứa: task_not_found / event_not_running / task_not_ready /
 * task_already_claimed / profile_not_found / cosmetic_unavailable.
 */
export async function claimEventTaskRpc(userId: string, taskId: number, now: Date): Promise<EventClaim> {
  const { data, error } = await db().rpc("claim_event_task", { p_user: userId, p_task: taskId, p_now: now.toISOString() });
  if (error) throw new RepoError("rpc.claim_event_task", error.message, error.code);
  const d = data as { reward_xp: number; xp: number | string; cosmetic: string | null; granted: boolean };
  return { rewardXp: Number(d.reward_xp), xp: Number(d.xp), cosmetic: d.cosmetic, granted: d.granted === true };
}

// ---------------- quản trị ----------------

export type EventInput = { key: string; name: string; blurb: string | null; startsAt: Date; endsAt: Date; claimDays: number };
export type EventPatch = Partial<Pick<EventInput, "name" | "blurb" | "startsAt" | "endsAt" | "claimDays">> & { status?: EventStatus };

export async function createEvent(input: EventInput): Promise<EventRow> {
  const r = unwrap<RawEvent>(
    "seasonal_events.create",
    await db().from("seasonal_events").insert({
      key: input.key, name: input.name, blurb: input.blurb, starts_at: input.startsAt.toISOString(), ends_at: input.endsAt.toISOString(), claim_days: input.claimDays,
    }).select(EVENT_COLS).single(),
  );
  return toEvent(r!);
}

export async function updateEvent(key: string, patch: EventPatch): Promise<EventRow> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.blurb !== undefined) row.blurb = patch.blurb;
  if (patch.startsAt !== undefined) row.starts_at = patch.startsAt.toISOString();
  if (patch.endsAt !== undefined) row.ends_at = patch.endsAt.toISOString();
  if (patch.claimDays !== undefined) row.claim_days = patch.claimDays;
  if (patch.status !== undefined) row.status = patch.status;
  const r = unwrap<RawEvent>("seasonal_events.update", await db().from("seasonal_events").update(row).eq("key", key).select(EVENT_COLS).single());
  return toEvent(r!);
}

/** Chỉ xóa được nháp (DB chặn đợt đã xuất bản: event_published). Trả dòng đã xóa (null nếu không có). */
export async function deleteEvent(key: string): Promise<EventRow | null> {
  const r = unwrap<RawEvent[]>("seasonal_events.delete", await db().from("seasonal_events").delete().eq("key", key).select(EVENT_COLS));
  return r?.[0] ? toEvent(r[0]) : null;
}

export type TaskInput = { eventKey: string; metric: EventMetric; target: number; title: string | null; rewardXp: number; rewardCosmetic: string | null; sort: number };

/** Thêm nhiệm vụ (DB chặn khi đợt đã xuất bản: event_locked). target của 'all' do trigger đồng bộ. */
export async function addEventTask(t: TaskInput): Promise<EventTask> {
  const r = unwrap<RawTask>(
    "event_tasks.add",
    await db().from("event_tasks").insert({
      event_key: t.eventKey, metric: t.metric, target: t.target, title: t.title, reward_xp: t.rewardXp, reward_cosmetic: t.rewardCosmetic, sort: t.sort,
    }).select(TASK_COLS).single(),
  );
  return toTask(r!);
}

/** Xóa một nhiệm vụ của đúng đợt đó. Trả dòng đã xóa (null nếu không có). */
export async function deleteEventTask(eventKey: string, id: number): Promise<EventTask | null> {
  const r = unwrap<RawTask[]>("event_tasks.delete", await db().from("event_tasks").delete().eq("id", id).eq("event_key", eventKey).select(TASK_COLS));
  return r?.[0] ? toTask(r[0]) : null;
}

/** RPC event_duplicate: sao chép nhiệm vụ + thưởng sang một đợt NHÁP mới với lịch mới (nguyên tử). */
export async function duplicateEvent(srcKey: string, newKey: string, startsAt: Date, endsAt: Date): Promise<void> {
  const { error } = await db().rpc("event_duplicate", { p_src: srcKey, p_new: newKey, p_starts: startsAt.toISOString(), p_ends: endsAt.toISOString() });
  if (error) throw new RepoError("rpc.event_duplicate", error.message, error.code);
}
