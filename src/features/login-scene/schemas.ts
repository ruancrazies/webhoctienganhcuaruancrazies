import { z } from "zod";
import { SCENE_GREETING_MAX, isIsoDate } from "../../core/loginScene";
import { isKnownScene } from "./scenes";

/**
 * Mọi thứ admin nhập đều qua đây: chọn scene từ danh sách có sẵn trong code, ngày, câu chào ngắn, số.
 * KHÔNG có ô nhập CSS, HTML hay URL ngoài; câu chào được React thoát ký tự khi render.
 */
export const sceneKeySchema = z.string().refine(isKnownScene, "Scene không tồn tại");

/** Câu chào: rút gọn khoảng trắng; rỗng = dùng câu chào mặc định trong code (null). Không nhận ký tự điều khiển. */
export const greetingSchema = z
  .string()
  .transform((v) => v.replace(/\s+/g, " ").trim())
  .refine((v) => v.length <= SCENE_GREETING_MAX, `Tối đa ${SCENE_GREETING_MAX} ký tự`)
  .refine((v) => !/[\u0000-\u001f\u007f<>]/.test(v), "Không dùng ký tự < > hoặc ký tự điều khiển")
  .transform((v) => (v === "" ? null : v));

const dateSchema = z.string().refine(isIsoDate, "Ngày không hợp lệ").refine((d) => d >= "2020-01-01" && d <= "2100-12-31", "Năm phải trong khoảng 2020–2100");
const dayNo = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86400000);
export const MAX_SCHEDULE_DAYS = 120; // khớp check của migration 0018

export const saveSceneSchema = z.object({
  key: sceneKeySchema,
  greeting: greetingSchema,
  status: z.enum(["draft", "published"]),
  motionEnabled: z.boolean(),
});

export const pinSchema = z.object({ key: sceneKeySchema, pin: z.boolean() });

export const scheduleSchema = z
  .object({
    key: sceneKeySchema,
    startsOn: dateSchema,
    endsOn: dateSchema,
    priority: z.coerce.number().int("Độ ưu tiên là số nguyên").min(0, "Từ 0 đến 100").max(100, "Từ 0 đến 100"),
  })
  .refine((v) => v.endsOn >= v.startsOn, { message: "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu", path: ["endsOn"] })
  .refine((v) => dayNo(v.endsOn) - dayNo(v.startsOn) <= MAX_SCHEDULE_DAYS, { message: `Một lịch tối đa ${MAX_SCHEDULE_DAYS} ngày (kiểm tra lại năm)`, path: ["endsOn"] });

export const deleteScheduleSchema = z.object({ key: sceneKeySchema, id: z.coerce.number().int().positive() });
