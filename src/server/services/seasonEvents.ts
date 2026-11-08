import { mergeCatalog, type CatalogItem, type CosmeticKind } from "../../core/cosmetics";
import type { QuestDelta } from "../../core/quests";
import {
  buildTaskViews, claimEndsAt, eventPhase, fmtLastDay, isClaimable, phaseCountdownText, publishCheck, sortForPlayers, visibleToPlayers,
  type EventPhase, type EventRow, type EventTask, type PublishCheck, type RewardCosmetic, type TaskView,
} from "../../core/seasonEvents";
import { manifestEntries } from "../../cosmetics/registry";
import { hasTag, ServiceError } from "../errors";
import { EVENT_CLAIM_PER_HOUR, HOUR } from "../limits";
import { hitRateLimit } from "../ratelimit";
import {
  bumpEventProgress, claimEventTaskRpc, claimUnlockNotices, eventStats, getEvent, listCatalogRows, listEventProgress, listEvents, listEventTasks,
  listPublishedEventsEndingAfter, type EventStat,
} from "../repo";
import { logActivity } from "./activity";
import { nowOf, type Ctx } from "./ctx";

const DAY_MS = 86_400_000;
/** Đợt còn nhận thưởng tối đa 14 ngày sau khi hết giờ (MAX_CLAIM_DAYS), nên chỉ cần đọc các đợt kết thúc trong khoảng đó. */
const LOOKBACK_MS = 15 * DAY_MS;

async function catalogMap(): Promise<Map<string, CatalogItem>> {
  return new Map(mergeCatalog(manifestEntries(), await listCatalogRows()).map((c) => [c.id, c]));
}

const rewardOf = (catalog: ReadonlyMap<string, CatalogItem>) => (id: string): RewardCosmetic | null => {
  const c = catalog.get(id);
  return c ? { id: c.id, name: c.name, kind: c.kind, rarity: c.rarity, durationDays: c.durationDays } : null;
};

// ---------------- người chơi ----------------

export type EventView = {
  key: string;
  name: string;
  blurb: string | null;
  phase: Exclude<EventPhase, "draft" | "ended">;
  /** "Còn 3 ngày 4 giờ" / "Mở sau 2 ngày" / "Còn 1 ngày để nhận thưởng" (tính lúc server dựng trang). */
  countdown: string;
  startsAt: string;
  endsAt: string;
  claimEndsAt: string;
  /** Ngày cuối còn làm được, dd/mm giờ VN. */
  lastDay: string;
  tasks: TaskView[];
  /** Số phần thưởng đang nhận được ngay. */
  claimable: number;
};

export type MyEvents = { events: EventView[]; claimable: number };

/** Các đợt người này thấy được (đang diễn ra, còn nhận thưởng, sắp mở) kèm tiến độ và phần thưởng. Chỉ đọc. */
export async function getMyEvents(userId: string, ctx: Ctx = {}): Promise<MyEvents> {
  const now = nowOf(ctx);
  const rows = (await listPublishedEventsEndingAfter(new Date(now.getTime() - LOOKBACK_MS))).filter((e) => visibleToPlayers(e, now));
  if (!rows.length) return { events: [], claimable: 0 };

  const tasks = await listEventTasks(rows.map((e) => e.key));
  const [progress, catalog] = await Promise.all([listEventProgress(userId, tasks.map((t) => t.id)), catalogMap()]);
  const reward = rewardOf(catalog);

  const events = rows.map((e): EventView => {
    const phase = eventPhase(e, now) as EventView["phase"];
    const views = buildTaskViews(tasks.filter((t) => t.eventKey === e.key), progress, reward);
    return {
      key: e.key, name: e.name, blurb: e.blurb, phase,
      countdown: phaseCountdownText(e, phase, now),
      startsAt: e.startsAt, endsAt: e.endsAt, claimEndsAt: claimEndsAt(e).toISOString(), lastDay: fmtLastDay(e.endsAt),
      tasks: views,
      claimable: views.filter((t) => isClaimable(t, phase)).length,
    };
  });
  const sorted = sortForPlayers(events);
  return { events: sorted, claimable: sorted.reduce((n, e) => n + e.claimable, 0) };
}

/** Tên các đợt đang hiện với người chơi theo mã sự kiện (để Bộ sưu tập nói "Nhận trong sự kiện “Giáng sinh”"). Lỗi DB → rỗng. */
export async function eventNames(ctx: Ctx = {}): Promise<Map<string, string>> {
  try {
    const now = nowOf(ctx);
    const rows = await listPublishedEventsEndingAfter(new Date(now.getTime() - LOOKBACK_MS));
    return new Map(rows.filter((e) => visibleToPlayers(e, now)).map((e) => [e.key, e.name]));
  } catch (e) {
    console.error("[events] đọc tên sự kiện thất bại", e);
    return new Map();
  }
}

// ---------------- tiến độ (gọi cùng nhiệm vụ ngày) ----------------

/**
 * Ghi tiến độ sự kiện sau khi một vòng / lần học đã được ghi nhận. KHÔNG ném lỗi: sự kiện chỉ là phần thưởng thêm,
 * lỗi ở đây không được làm hỏng kết quả vòng chơi đã lưu.
 */
export async function recordEventProgress(userId: string, delta: QuestDelta, ctx: Ctx = {}): Promise<void> {
  try {
    await bumpEventProgress(userId, nowOf(ctx), delta);
  } catch (e) {
    console.error("[events] ghi tiến độ thất bại", e);
  }
}

// ---------------- nhận thưởng ----------------

export type ClaimEventResult = {
  taskId: number;
  rewardXp: number;
  xp: number;
  /** Món cosmetic của phần thưởng. granted = false khi người này đang còn món đó (không gia hạn). */
  cosmetic: { id: string; name: string; kind: CosmeticKind; granted: boolean } | null;
};

export async function claimEventTask(userId: string, taskId: number, ctx: Ctx = {}): Promise<ClaimEventResult> {
  if (!(await hitRateLimit(`event-claim:${userId}`, HOUR, EVENT_CLAIM_PER_HOUR))) {
    throw new ServiceError(429, "RATE_LIMITED", "Bạn thao tác quá nhiều, hãy nghỉ một chút");
  }
  const now = nowOf(ctx);
  try {
    const r = await claimEventTaskRpc(userId, taskId, now);
    let cosmetic: ClaimEventResult["cosmetic"] = null;
    if (r.cosmetic) {
      const c = (await catalogMap()).get(r.cosmetic);
      cosmetic = { id: r.cosmetic, name: c?.name ?? r.cosmetic, kind: c?.kind ?? "frame", granted: r.granted };
      // Người dùng đã được báo ngay trên màn hình này → đánh dấu đã báo để thú cưng không nhắc lại lần nữa.
      if (r.granted) await claimUnlockNotices(userId, [r.cosmetic]).catch((e) => console.error("[events] đánh dấu đã báo thất bại", e));
    }
    await logActivity(userId, "events/claim", { task: taskId, xp: r.rewardXp, cosmetic: r.cosmetic, granted: r.granted });
    return { taskId, rewardXp: r.rewardXp, xp: r.xp, cosmetic };
  } catch (e) {
    if (hasTag(e, "task_already_claimed")) throw new ServiceError(409, "TASK_CLAIMED", "Bạn đã nhận thưởng nhiệm vụ này rồi");
    if (hasTag(e, "task_not_ready")) throw new ServiceError(409, "TASK_NOT_READY", "Nhiệm vụ chưa hoàn thành");
    if (hasTag(e, "event_not_running")) throw new ServiceError(409, "EVENT_CLOSED", "Sự kiện này chưa bắt đầu hoặc đã hết hạn nhận thưởng");
    if (hasTag(e, "task_not_found")) throw new ServiceError(404, "TASK_NOT_FOUND", "Không tìm thấy nhiệm vụ này");
    if (hasTag(e, "cosmetic_unavailable")) {
      console.error("[events] phần thưởng không cấp được (món ngừng cung cấp hoặc ngoài cửa nhận)", { taskId });
      throw new ServiceError(409, "REWARD_UNAVAILABLE", "Phần thưởng đang tạm thời không phát được. Bạn chưa mất gì, hãy thử lại sau.");
    }
    throw e;
  }
}

// ---------------- quản trị ----------------

export type AdminEventRow = { event: EventRow; phase: EventPhase; taskCount: number; stat: EventStat };

/** Danh sách mọi đợt cho trang quản trị, mới nhất trước. */
export async function listAdminEvents(ctx: Ctx = {}): Promise<AdminEventRow[]> {
  const now = nowOf(ctx);
  const events = await listEvents();
  const keys = events.map((e) => e.key);
  const [tasks, stats] = await Promise.all([listEventTasks(keys), eventStats(keys)]);
  return events.map((event) => ({
    event,
    phase: eventPhase(event, now),
    taskCount: tasks.filter((t) => t.eventKey === event.key).length,
    stat: stats.get(event.key) ?? { participants: 0, claims: 0 },
  }));
}

export type RewardOption = { id: string; label: string; kind: CosmeticKind; synced: boolean; active: boolean };

export type AdminEventView = {
  event: EventRow;
  phase: EventPhase;
  tasks: EventTask[];
  /** Cùng dữ liệu người chơi sẽ thấy (tiến độ 0) để admin xem trước. */
  preview: TaskView[];
  check: PublishCheck;
  stat: EventStat;
  /** Món có thể chọn làm thưởng (mọi món trong code, kèm trạng thái đồng bộ/bật). */
  options: RewardOption[];
};

export async function getAdminEvent(key: string, ctx: Ctx = {}): Promise<AdminEventView | null> {
  const now = nowOf(ctx);
  const event = await getEvent(key);
  if (!event) return null;
  const [tasks, catalog, stats] = await Promise.all([listEventTasks([key]), catalogMap(), eventStats([key])]);
  return {
    event,
    phase: eventPhase(event, now),
    tasks,
    preview: buildTaskViews(tasks, [], rewardOf(catalog)),
    check: publishCheck(event, tasks, catalog, now),
    stat: stats.get(key) ?? { participants: 0, claims: 0 },
    options: [...catalog.values()].map((c) => ({ id: c.id, label: c.name, kind: c.kind, synced: c.synced, active: c.active })).sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label, "vi")),
  };
}

/** Danh mục (đã gộp DB) để action admin kiểm trước khi xuất bản. */
export const adminCatalog = catalogMap;
