import { after } from "next/server";
import { handleSendEmail, MAIL_GLOBAL_PER_DAY } from "@/server/auth/send-email-hook";
import { optionalEnv, requireEnv } from "@/server/env";
import { sendMail } from "@/server/mail";
import { hitRateLimit } from "@/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Trần mail/ngày toàn hệ thống: tự đặt bằng MAIL_GLOBAL_PER_DAY; mặc định 90 (Gmail) hoặc 1000 khi dùng Resend. */
function globalPerDay(): number {
  const n = Number(optionalEnv("MAIL_GLOBAL_PER_DAY"));
  if (Number.isInteger(n) && n > 0) return n;
  return optionalEnv("RESEND_API_KEY") ? 1000 : MAIL_GLOBAL_PER_DAY;
}

/** Send Email Hook: Supabase Auth gọi vào đây thay vì tự gửi mail. Kiểm tra chữ ký trước mọi việc khác. */
export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text(); // phải đọc nguyên văn để kiểm tra chữ ký

  const { status, body } = await handleSendEmail(rawBody, req.headers, {
    secret: requireEnv("SEND_EMAIL_HOOK_SECRET"),
    rateLimit: hitRateLimit,
    sendMail,
    defer: (task) => after(task),
    globalPerDay: globalPerDay(),
  });
  return Response.json(body, { status });
}
