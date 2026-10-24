import { after } from "next/server";
import { handleSendEmail } from "@/server/auth/send-email-hook";
import { requireEnv } from "@/server/env";
import { sendMail } from "@/server/mail";
import { hitRateLimit } from "@/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Send Email Hook: Supabase Auth gọi vào đây thay vì tự gửi mail. Kiểm tra chữ ký trước mọi việc khác. */
export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text(); // phải đọc nguyên văn để kiểm tra chữ ký

  const { status, body } = await handleSendEmail(rawBody, req.headers, {
    secret: requireEnv("SEND_EMAIL_HOOK_SECRET"),
    rateLimit: hitRateLimit,
    sendMail,
    defer: (task) => after(task),
  });
  return Response.json(body, { status });
}
