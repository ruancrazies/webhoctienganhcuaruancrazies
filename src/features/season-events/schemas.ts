import { z } from "zod";
import { isIsoDate } from "../../core/loginScene";
import {
  DEFAULT_CLAIM_DAYS, EVENT_BLURB_MAX, EVENT_KEY_RE, EVENT_METRICS, EVENT_NAME_MAX, MAX_CLAIM_DAYS, MAX_EVENT_DAYS, MAX_REWARD_XP, MAX_TASK_TARGET, TASK_TITLE_MAX, windowDays,
} from "../../core/seasonEvents";
import { manifestEntries } from "../../cosmetics/registry";

/**
 * Mọi thứ admin nhập cho sự kiện đều qua đây: mã, tên và mô tả ngắn (chữ thuần), ngày, số, loại nhiệm vụ từ danh sách cố định,
 * món thưởng từ registry trong code. KHÔNG có ô nhập CSS, HTML hay URL; chữ được React thoát ký tự khi render.
 */
export const eventKeySchema = z.string().regex(EVENT_KEY_RE, "Mã: chữ thường, số, gạch ngang; 2–32 ký tự; bắt đầu bằng chữ cái (vd giang-sinh-2026)");

/** Rút gọn khoảng trắng; không nhận ký tự < > hay ký tự điều khiển. */
const plain = (max: number, label: string) =>
  z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .refine((v) => v.length <= max, `${label} tối đa ${max} ký tự`)
    .refine((v) => !/[\u0000-\u001f\u007f<>]/.test(v), `${label} không dùng ký tự < > hoặc ký tự điều khiển`);

export const nameSchema = plain(EVENT_NAME_MAX, "Tên").refine((v) => v.length >= 1, "Nhập tên sự kiện");
export const blurbSchema = plain(EVENT_BLURB_MAX, "Mô tả").transform((v) => (v === "" ? null : v));
const titleSchema = plain(TASK_TITLE_MAX, "Tên nhiệm vụ").transform((v) => (v === "" ? null : v));

const dateSchema = z.string().refine(isIsoDate, "Ngày không hợp lệ").refine((d) => d >= "2020-01-01" && d <= "2100-12-31", "Năm phải trong khoảng 2020–2100");
const claimDaysSchema = z.coerce.number().int("Số ngày là số nguyên").min(0, `Từ 0 đến ${MAX_CLAIM_DAYS}`).max(MAX_CLAIM_DAYS, `Từ 0 đến ${MAX_CLAIM_DAYS}`);

// Refine của object vẫn chạy khi một ngày đã sai: phải tự bảo vệ, không để ngày xấu đi vào phép tính.
const valid = (v: { startsOn: string; endsOn: string }) => isIsoDate(v.startsOn) && isIsoDate(v.endsOn);
const range = <T extends { startsOn: string; endsOn: string }>(v: T) => !valid(v) || v.endsOn >= v.startsOn;
const spanOk = <T extends { startsOn: string; endsOn: string }>(v: T) => !valid(v) || v.endsOn < v.startsOn || windowDays(v.startsOn, v.endsOn) <= MAX_EVENT_DAYS;
const RANGE_MSG = { message: "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu", path: ["endsOn"] };
const SPAN_MSG = { message: `Một sự kiện tối đa ${MAX_EVENT_DAYS} ngày (kiểm tra lại năm)`, path: ["endsOn"] };

export const createEventSchema = z
  .object({ key: eventKeySchema, name: nameSchema, blurb: blurbSchema, startsOn: dateSchema, endsOn: dateSchema, claimDays: claimDaysSchema.default(DEFAULT_CLAIM_DAYS) })
  .refine(range, RANGE_MSG)
  .refine(spanOk, SPAN_MSG);

export const saveEventSchema = createEventSchema;

export const eventOpSchema = z.object({ key: eventKeySchema, op: z.enum(["publish", "unpublish", "end", "delete"]) });

export const duplicateEventSchema = z
  .object({ key: eventKeySchema, newKey: eventKeySchema, startsOn: dateSchema, endsOn: dateSchema })
  .refine((v) => v.key !== v.newKey, { message: "Mã mới phải khác mã cũ", path: ["newKey"] })
  .refine(range, RANGE_MSG)
  .refine(spanOk, SPAN_MSG);

const KNOWN_COSMETICS = new Set(manifestEntries().map((m) => m.id));

const targetSchema = z.coerce.number().int("Mục tiêu là số nguyên").min(1, "Mục tiêu tối thiểu 1").max(MAX_TASK_TARGET, `Mục tiêu tối đa ${MAX_TASK_TARGET}`);

export const addTaskSchema = z
  .object({
    key: eventKeySchema,
    metric: z.enum(EVENT_METRICS as unknown as [string, ...string[]]),
    target: z.string().default(""),
    title: titleSchema,
    rewardXp: z.coerce.number().int("XP là số nguyên").min(0, "XP không âm").max(MAX_REWARD_XP, `XP tối đa ${MAX_REWARD_XP}`),
    rewardCosmetic: z.string().transform((v) => (v === "" ? null : v)).refine((v) => v === null || KNOWN_COSMETICS.has(v), "Món thưởng không tồn tại trong code"),
  })
  .refine((v) => v.rewardXp > 0 || v.rewardCosmetic !== null, { message: "Mỗi nhiệm vụ cần ít nhất một phần thưởng (XP hoặc một món)", path: ["rewardXp"] })
  // 'all' tự tính mục tiêu = số nhiệm vụ khác (DB đồng bộ): bỏ qua giá trị nhập. Loại khác bắt buộc mục tiêu hợp lệ.
  .transform((v, ctx) => {
    const metric = v.metric as (typeof EVENT_METRICS)[number];
    if (metric === "all") return { ...v, metric, target: 1 };
    const t = targetSchema.safeParse(v.target);
    if (!t.success) {
      ctx.issues.push({ code: "custom", message: t.error.issues[0]?.message ?? "Mục tiêu không hợp lệ", path: ["target"], input: v.target });
      return z.NEVER;
    }
    return { ...v, metric, target: t.data };
  });

export const deleteTaskSchema = z.object({ key: eventKeySchema, id: z.coerce.number().int().positive() });
