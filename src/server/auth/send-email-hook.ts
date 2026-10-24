import { z } from "zod";
import { keyHash } from "../hash";
import type { Mail } from "../mail";
import { buildMail } from "../mail-templates";
import { HookSignatureError, verifyHookSignature } from "./hook-signature";

/**
 * Send Email Hook của Supabase Auth (mục 5.10). Toàn bộ logic nằm ở đây để test được,
 * Route Handler chỉ nối các phụ thuộc thật vào.
 *
 * Supabase chờ hook tối đa 5 giây (rồi thử lại), còn Apps Script có thể chậm vài giây. Vì vậy:
 * gửi mail xong trong `budgetMs` thì báo thành công; quá hạn thì báo thành công ngay và để việc gửi
 * chạy tiếp ở nền (`defer`), tránh để Supabase hết giờ và gửi lại → người dùng nhận trùng mã.
 */
export type HookDeps = {
  secret: string;
  rateLimit: (key: string, windowSeconds: number, max: number) => Promise<boolean>;
  sendMail: (mail: Mail) => Promise<void>;
  /** Chạy tiếp việc gửi mail sau khi đã trả lời (Next `after`). */
  defer: (task: () => Promise<void>) => void;
  nowMs?: number;
  budgetMs?: number;
};

export type HookResult = { status: number; body: Record<string, unknown> };

export const MAIL_PER_EMAIL_PER_HOUR = 5;
const DEFAULT_BUDGET_MS = 4000;

const payloadSchema = z.object({
  user: z.looseObject({ email: z.string() }),
  email_data: z.looseObject({
    token: z.string(),
    email_action_type: z.string(),
  }),
});

const fail = (status: number, message: string): HookResult => ({
  status,
  body: { error: { http_code: status, message } },
});

export async function handleSendEmail(rawBody: string, headers: Pick<Headers, "get">, deps: HookDeps): Promise<HookResult> {
  try {
    verifyHookSignature(rawBody, headers, deps.secret, deps.nowMs);
  } catch (e) {
    if (e instanceof HookSignatureError) return fail(401, "Chữ ký không hợp lệ");
    throw e;
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return fail(400, "Nội dung không phải JSON");
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return fail(400, "Nội dung hook không đúng định dạng");
  const { user, email_data } = parsed.data;

  let built;
  try {
    built = buildMail(email_data.email_action_type, email_data.token);
  } catch {
    return fail(400, "Mã xác nhận không hợp lệ");
  }
  if (!built) return fail(400, `Chưa hỗ trợ loại email "${email_data.email_action_type}"`);

  // Chống dùng hệ thống để gửi thư rác tới một địa chỉ (cũng bảo vệ hạn mức Gmail).
  const allowed = await deps.rateLimit(`mail:${keyHash(user.email)}`, 3600, MAIL_PER_EMAIL_PER_HOUR);
  if (!allowed) return fail(429, "Đã gửi quá nhiều email tới địa chỉ này, vui lòng thử lại sau");

  const task = deps.sendMail({ to: user.email, ...built });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<"slow">((resolve) => {
    timer = setTimeout(() => resolve("slow"), deps.budgetMs ?? DEFAULT_BUDGET_MS);
  });

  try {
    const outcome = await Promise.race([task.then(() => "sent" as const), budget]);
    if (outcome === "slow") {
      deps.defer(async () => {
        try {
          await task;
        } catch (e) {
          console.error("[send-email-hook] gửi mail nền thất bại:", e);
        }
      });
    }
    return { status: 200, body: {} };
  } catch (e) {
    console.error("[send-email-hook] gửi mail thất bại:", e);
    return fail(502, "Không gửi được email, vui lòng thử lại sau");
  } finally {
    clearTimeout(timer);
  }
}
