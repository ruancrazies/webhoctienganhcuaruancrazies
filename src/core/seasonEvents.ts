/**
 * Sự kiện theo mùa (giai đoạn 3): quy tắc thuần, dùng được ở server lẫn client, không đụng DB.
 * (Không nhầm với core/events.ts: đó là sự kiện PHÂN TÍCH của câu trả lời.)
 *
 *  • eventPhase       một đợt đang ở giai đoạn nào (nháp → chưa tới giờ → đang diễn ra → còn nhận thưởng → kết thúc)
 *  • vnDateToInstant  ngày giờ Việt Nam ↔ thời điểm tuyệt đối (admin nhập NGÀY, DB lưu giờ)
 *  • countdown        đếm ngược bằng chữ
 *  • buildTaskViews   nhiệm vụ + tiến độ + thưởng → thứ giao diện cần vẽ
 *  • publishCheck     những gì phải đúng trước khi xuất bản (lỗi chặn) và những gì chỉ nên cảnh báo
 *
 * Mọi hàm nhận `now` do server đưa vào mỗi lần đọc: giai đoạn không cần job nền nên luôn đúng.
 */
import type { CatalogItem, CosmeticKind } from "./cosmetics";
import type { Rarity } from "../cosmetics/core/define";
import { isIsoDate } from "./loginScene";
import { dayNo, startOfDay } from "./streak";

export const EVENT_KEY_RE = /^[a-z][a-z0-9-]{1,31}$/;
export const EVENT_NAME_MAX = 80;
export const EVENT_BLURB_MAX = 240;
export const TASK_TITLE_MAX = 80;
/** Khớp check của migration 0020. */
export const MAX_EVENT_DAYS = 120;
export const MAX_CLAIM_DAYS = 14;
export const DEFAULT_CLAIM_DAYS = 2;
export const MAX_TASKS_PER_EVENT = 8;
export const MAX_TASK_TARGET = 100_000;
export const MAX_REWARD_XP = 100_000;
/** Sự kiện sắp mở trong bấy nhiêu ngày thì hiện ở tab Sự kiện (để người dùng biết mà chờ). */
export const UPCOMING_DAYS = 14;

const MIN = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * HOUR_MS;

// ---------------- kiểu ----------------

export type EventMetric = "learn" | "review" | "play" | "test" | "all";
export const EVENT_METRICS: readonly EventMetric[] = ["learn", "review", "play", "test", "all"];
export const isEventMetric = (v: unknown): v is EventMetric => EVENT_METRICS.includes(v as EventMetric);

export type EventStatus = "draft" | "published";

export type EventRow = {
  key: string;
  name: string;
  blurb: string | null;
  /** ISO. 00:00 giờ VN của ngày bắt đầu. */
  startsAt: string;
  /** ISO. 00:00 giờ VN của ngày SAU ngày kết thúc (loại trừ). */
  endsAt: string;
  claimDays: number;
  status: EventStatus;
};

export type EventTask = {
  id: number;
  eventKey: string;
  metric: EventMetric;
  target: number;
  title: string | null;
  rewardXp: number;
  rewardCosmetic: string | null;
  sort: number;
};

export type ProgressRow = { taskId: number; progress: number; claimed: boolean };

// ---------------- giai đoạn ----------------

export type EventPhase = "draft" | "scheduled" | "running" | "claiming" | "ended";

export const PHASE_LABEL: Record<EventPhase, string> = {
  draft: "Nháp",
  scheduled: "Sắp diễn ra",
  running: "Đang diễn ra",
  claiming: "Còn nhận thưởng",
  ended: "Đã kết thúc",
};

/** Hết hạn nhận thưởng (loại trừ): ends_at + claim_days. */
export const claimEndsAt = (e: Pick<EventRow, "endsAt" | "claimDays">): Date => new Date(new Date(e.endsAt).getTime() + e.claimDays * DAY_MS);

export function eventPhase(e: Pick<EventRow, "status" | "startsAt" | "endsAt" | "claimDays">, now: Date): EventPhase {
  if (e.status !== "published") return "draft";
  const t = now.getTime();
  if (t < new Date(e.startsAt).getTime()) return "scheduled";
  if (t < new Date(e.endsAt).getTime()) return "running";
  if (t < claimEndsAt(e).getTime()) return "claiming";
  return "ended";
}

/** Tiến độ chỉ tăng khi đang diễn ra; nhận thưởng được cả lúc đang diễn ra lẫn lúc còn nhận thưởng. */
export const canProgress = (p: EventPhase): boolean => p === "running";
export const canClaim = (p: EventPhase): boolean => p === "running" || p === "claiming";

/** Người dùng thấy đợt nào: đang diễn ra, còn nhận thưởng, hoặc sắp mở trong UPCOMING_DAYS ngày. Nháp / đã kết thúc thì ẩn. */
export function visibleToPlayers(e: EventRow, now: Date): boolean {
  const p = eventPhase(e, now);
  if (p === "running" || p === "claiming") return true;
  return p === "scheduled" && new Date(e.startsAt).getTime() - now.getTime() <= UPCOMING_DAYS * DAY_MS;
}

const PHASE_ORDER: Record<EventPhase, number> = { running: 0, claiming: 1, scheduled: 2, ended: 3, draft: 4 };

/** Đang diễn ra trước (sắp hết trước), rồi còn nhận thưởng, rồi sắp diễn ra (sắp mở trước). */
export function sortForPlayers<T extends { phase: EventPhase; startsAt: string; endsAt: string }>(list: readonly T[]): T[] {
  return [...list].sort(
    (a, b) =>
      PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] ||
      (a.phase === "scheduled" ? a.startsAt.localeCompare(b.startsAt) : a.endsAt.localeCompare(b.endsAt)),
  );
}

// ---------------- ngày giờ Việt Nam ----------------

/** 00:00 giờ VN của ngày lịch `yyyy-mm-dd`. Không phụ thuộc múi giờ máy chạy. */
export function vnDateToInstant(iso: string): Date {
  if (!isIsoDate(iso)) throw new Error(`ngày không hợp lệ: ${iso}`);
  return startOfDay(Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS));
}

/** Ngày lịch `yyyy-mm-dd` theo giờ VN của một thời điểm. */
export const instantToVnDate = (d: Date | string): string => new Date(new Date(d).getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

/** Admin nhập "từ ngày … đến hết ngày …" (đều bao gồm) → cửa sổ [startsAt, endsAt). */
export function windowFromDates(startsOn: string, endsOn: string): { startsAt: Date; endsAt: Date } {
  return { startsAt: vnDateToInstant(startsOn), endsAt: new Date(vnDateToInstant(endsOn).getTime() + DAY_MS) };
}

/** Ngược lại: ngày bắt đầu và ngày kết thúc (đều bao gồm) để hiện lại trong form. */
export const datesOfWindow = (e: Pick<EventRow, "startsAt" | "endsAt">): { startsOn: string; endsOn: string } => ({
  startsOn: instantToVnDate(e.startsAt),
  endsOn: instantToVnDate(new Date(new Date(e.endsAt).getTime() - 1)),
});

/** Số ngày của cửa sổ (bao gồm cả hai đầu). */
export const windowDays = (startsOn: string, endsOn: string): number => dayNo(vnDateToInstant(endsOn)) - dayNo(vnDateToInstant(startsOn)) + 1;

/** "dd/mm" theo giờ VN. */
export function fmtVnDayMonth(d: Date | string): string {
  const s = instantToVnDate(d);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}`;
}

/** "dd/mm/yyyy" theo giờ VN. */
export function fmtVnDate(d: Date | string): string {
  const s = instantToVnDate(d);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
}

/** "dd/mm" ngày CUỐI CÙNG còn làm được (ends_at là mốc loại trừ nên lùi một mili giây). */
export const fmtLastDay = (endsAt: Date | string): string => fmtVnDayMonth(new Date(new Date(endsAt).getTime() - 1));

// ---------------- đếm ngược ----------------

/** Khoảng còn lại bằng chữ ("3 ngày 4 giờ", "5 giờ 20 phút", "12 phút", "dưới 1 phút"); null nếu đã qua. Không kèm chữ "Còn". */
export function countdown(to: Date | string, now: Date): string | null {
  const ms = new Date(to).getTime() - now.getTime();
  if (ms <= 0) return null;
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((ms % HOUR_MS) / MIN);
  if (days > 0) return hours > 0 ? `${days} ngày ${hours} giờ` : `${days} ngày`;
  if (hours > 0) return minutes > 0 ? `${hours} giờ ${minutes} phút` : `${hours} giờ`;
  return minutes > 0 ? `${minutes} phút` : "dưới 1 phút";
}

/** Câu đếm ngược phù hợp với giai đoạn: "Còn 3 ngày 4 giờ", "Mở sau 2 ngày", "Còn 1 ngày để nhận thưởng". */
export function phaseCountdownText(e: Pick<EventRow, "startsAt" | "endsAt" | "claimDays">, phase: EventPhase, now: Date): string {
  if (phase === "scheduled") {
    const c = countdown(e.startsAt, now);
    return c ? `Mở sau ${c}` : "Sắp mở";
  }
  if (phase === "running") {
    const c = countdown(e.endsAt, now);
    return c ? `Còn ${c}` : "Sắp kết thúc";
  }
  if (phase === "claiming") {
    const c = countdown(claimEndsAt(e), now);
    return c ? `Còn ${c} để nhận thưởng` : "Sắp hết hạn nhận thưởng";
  }
  return "";
}

// ---------------- nhiệm vụ ----------------

/** Tên mặc định của nhiệm vụ theo loại (admin có thể đặt tên riêng). */
export function metricTitle(metric: EventMetric, target: number): string {
  switch (metric) {
    case "learn":
      return `Học ${target} từ mới`;
    case "review":
      return `Ôn ${target} từ cũ`;
    case "play":
      return target === 1 ? "Chơi một trò chơi bất kỳ" : `Chơi ${target} trò chơi`;
    case "test":
      return target === 1 ? "Làm một bài kiểm tra" : `Làm ${target} bài kiểm tra`;
    default:
      return "Hoàn thành mọi nhiệm vụ của sự kiện";
  }
}

export const taskTitle = (t: Pick<EventTask, "metric" | "target" | "title">): string => t.title?.trim() || metricTitle(t.metric, t.target);

export const METRIC_LABEL: Record<EventMetric, string> = {
  learn: "Học từ mới",
  review: "Ôn từ cũ",
  play: "Chơi trò chơi",
  test: "Làm bài kiểm tra",
  all: "Hoàn thành tất cả",
};

export type RewardCosmetic = { id: string; name: string; kind: CosmeticKind; rarity: Rarity | null; durationDays: number | null };

export type TaskView = {
  id: number;
  title: string;
  metric: EventMetric;
  target: number;
  progress: number;
  /** Đủ tiến độ. */
  done: boolean;
  claimed: boolean;
  rewardXp: number;
  reward: RewardCosmetic | null;
};

/**
 * Ghép nhiệm vụ với tiến độ của MỘT người. Chưa có dòng = chưa làm gì (tiến độ 0). Nhiệm vụ 'all' tính từ các nhiệm vụ còn lại
 * (số nhiệm vụ khác đã đủ), nên luôn đúng kể cả khi dòng tiến độ của nó chưa được ghi.
 */
export function buildTaskViews(tasks: readonly EventTask[], rows: readonly ProgressRow[], rewardOf: (cosmeticId: string) => RewardCosmetic | null): TaskView[] {
  const byTask = new Map(rows.map((r) => [r.taskId, r]));
  const sorted = [...tasks].sort((a, b) => a.sort - b.sort || a.id - b.id);
  const others = sorted.filter((t) => t.metric !== "all");
  const othersDone = others.filter((t) => (byTask.get(t.id)?.progress ?? 0) >= t.target).length;
  return sorted.map((t) => {
    const r = byTask.get(t.id);
    const target = t.metric === "all" ? Math.max(1, others.length) : t.target;
    const raw = t.metric === "all" ? othersDone : (r?.progress ?? 0);
    const progress = Math.min(Math.max(0, raw), target);
    const claimed = r?.claimed ?? false;
    return {
      id: t.id,
      title: taskTitle({ ...t, target }),
      metric: t.metric,
      target,
      progress,
      done: claimed || progress >= target,
      claimed,
      rewardXp: t.rewardXp,
      reward: t.rewardCosmetic ? rewardOf(t.rewardCosmetic) : null,
    };
  });
}

/** Nhận được lúc này? (Đủ tiến độ, chưa nhận, và sự kiện đang ở giai đoạn cho nhận.) */
export const isClaimable = (t: Pick<TaskView, "done" | "claimed">, phase: EventPhase): boolean => t.done && !t.claimed && canClaim(phase);

/** Dòng mô tả phần thưởng bằng chữ (không chỉ bằng hình/màu): "+200 XP · Khung “Nón Giáng sinh” (Hiếm, 30 ngày)". */
export function rewardText(t: Pick<TaskView, "rewardXp" | "reward">, rarityLabel: (r: Rarity) => string, kindLabel: (k: CosmeticKind) => string): string {
  const parts: string[] = [];
  if (t.rewardXp > 0) parts.push(`+${t.rewardXp.toLocaleString("vi-VN")} XP`);
  if (t.reward) {
    const extra = [t.reward.rarity ? rarityLabel(t.reward.rarity) : null, t.reward.durationDays ? `${t.reward.durationDays} ngày` : "vĩnh viễn"].filter(Boolean).join(", ");
    parts.push(`${kindLabel(t.reward.kind)} “${t.reward.name}” (${extra})`);
  }
  return parts.join(" · ");
}

// ---------------- kiểm tra trước khi xuất bản ----------------

export type PublishCheck = { errors: string[]; warnings: string[] };

/**
 * Điều kiện để xuất bản. `errors` chặn (xuất bản sẽ làm người chơi không nhận được thưởng); `warnings` chỉ nhắc.
 *  • phải có nhiệm vụ, và nếu có nhiệm vụ 'all' thì phải còn nhiệm vụ khác
 *  • mỗi món thưởng phải còn trong code + còn bật + cửa nhận của món (nếu có) bao trọn thời gian nhận thưởng của sự kiện
 *  • sự kiện chưa hết hạn nhận thưởng
 * Cảnh báo: món thưởng có luật mở khóa không phải "sự kiện này" → Bộ sưu tập sẽ hiện sai điều kiện nhận.
 */
export function publishCheck(e: EventRow, tasks: readonly EventTask[], catalog: ReadonlyMap<string, CatalogItem>, now: Date): PublishCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!tasks.length) errors.push("Chưa có nhiệm vụ nào.");
  if (tasks.some((t) => t.metric === "all") && !tasks.some((t) => t.metric !== "all")) errors.push("Nhiệm vụ “hoàn thành tất cả” cần ít nhất một nhiệm vụ khác.");
  if (claimEndsAt(e).getTime() <= now.getTime()) errors.push("Sự kiện đã quá hạn nhận thưởng, xuất bản lúc này không ai nhận được gì.");

  const claimEnd = claimEndsAt(e).getTime();
  const seen = new Set<string>();
  for (const t of tasks) {
    if (!t.rewardCosmetic || seen.has(t.rewardCosmetic)) continue;
    seen.add(t.rewardCosmetic);
    const c = catalog.get(t.rewardCosmetic);
    if (!c) {
      errors.push(`Món thưởng “${t.rewardCosmetic}” không còn trong code.`);
      continue;
    }
    if (!c.synced) errors.push(`Món “${c.name}” chưa được đồng bộ vào DB (chạy npm run cosmetics:sync).`);
    if (!c.active) errors.push(`Món “${c.name}” đang ngừng cung cấp nên không cấp được.`);
    if (c.availableFrom && new Date(c.availableFrom).getTime() > new Date(e.startsAt).getTime()) errors.push(`Cửa nhận của “${c.name}” mở sau ngày bắt đầu sự kiện.`);
    if (c.availableUntil && new Date(c.availableUntil).getTime() < claimEnd) errors.push(`Cửa nhận của “${c.name}” đóng trước khi hết hạn nhận thưởng của sự kiện.`);
    if (c.unlock.type !== "event") warnings.push(`“${c.name}” không có luật “sự kiện” (đang là ${c.unlock.type}); Bộ sưu tập sẽ không chỉ về sự kiện này.`);
    else if (c.unlock.event !== e.key) warnings.push(`“${c.name}” ghi nhận sự kiện “${c.unlock.event}” chứ không phải “${e.key}”; Bộ sưu tập sẽ hiện sai điều kiện nhận.`);
  }
  if (tasks.length > MAX_TASKS_PER_EVENT) errors.push(`Tối đa ${MAX_TASKS_PER_EVENT} nhiệm vụ một sự kiện.`);
  return { errors, warnings };
}

// ---------------- sửa sự kiện đã xuất bản ----------------

/**
 * Admin được sửa gì theo giai đoạn (tên và mô tả luôn sửa được):
 *  • nháp / sắp diễn ra: cả lịch lẫn thời gian nhận thưởng (chưa ai có tiến độ)
 *  • đang diễn ra: chỉ ngày kết thúc (kéo dài hoặc rút ngắn, nhưng phải còn ở tương lai) và số ngày nhận thưởng; ngày bắt đầu đã khóa
 *  • còn nhận thưởng / đã kết thúc: lịch khóa hẳn (người chơi đang dựa vào mốc đó)
 * Trả lời lỗi bằng chữ, hoặc null nếu hợp lệ.
 */
export function checkEventEdit(
  old: Pick<EventRow, "startsAt" | "endsAt" | "claimDays">,
  next: { startsAt: Date; endsAt: Date; claimDays: number },
  phase: EventPhase,
  now: Date,
): string | null {
  const sameStart = next.startsAt.getTime() === new Date(old.startsAt).getTime();
  const sameEnd = next.endsAt.getTime() === new Date(old.endsAt).getTime();
  if (phase === "draft" || phase === "scheduled") return null;
  if (phase === "running") {
    if (!sameStart) return "Sự kiện đã bắt đầu nên không đổi được ngày bắt đầu.";
    if (next.endsAt.getTime() <= now.getTime()) return "Ngày kết thúc phải còn ở phía trước. Muốn dừng ngay, dùng nút “Kết thúc sớm”.";
    return null;
  }
  if (!sameStart || !sameEnd || next.claimDays !== old.claimDays) return "Sự kiện đã hết giờ làm nên không đổi được lịch. Muốn chạy lại, hãy nhân bản sang một đợt mới.";
  return null;
}

/** Thao tác trạng thái nào hợp lệ ở giai đoạn nào. */
export function canDo(op: "publish" | "unpublish" | "end" | "delete", phase: EventPhase): boolean {
  switch (op) {
    case "publish":
      return phase === "draft";
    case "unpublish":
      return phase === "scheduled"; // đã bắt đầu thì có thể đã có tiến độ (DB cũng chặn)
    case "end":
      return phase === "running";
    default:
      return phase === "draft"; // đã xuất bản không xóa (người chơi có thể đã có tiến độ/thưởng)
  }
}
