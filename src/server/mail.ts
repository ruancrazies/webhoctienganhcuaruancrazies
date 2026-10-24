import "server-only";
import { optionalEnv, requireEnv } from "./env";

export type Mail = { to: string; subject: string; html: string };

export class MailError extends Error {}

const SEND_TIMEOUT_MS = 20_000;

/**
 * Gửi mail. Chọn kênh theo biến môi trường:
 *  - RESEND_API_KEY có giá trị → Resend (dự phòng khi Apps Script không đủ hạn mức)
 *  - ngược lại → Apps Script webhook (MAIL_WEBHOOK_URL + MAIL_WEBHOOK_SECRET)
 *  - chưa cấu hình gì và KHÔNG phải production → in nội dung ra console (để thử cục bộ)
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (optionalEnv("RESEND_API_KEY")) return sendViaResend(mail);
  if (optionalEnv("MAIL_WEBHOOK_URL")) return sendViaAppsScript(mail);

  if (process.env.NODE_ENV !== "production") {
    console.log(`\n[mail:dev] → ${mail.to}\n[mail:dev] ${mail.subject}\n[mail:dev] ${mail.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}\n`);
    return;
  }
  throw new MailError("Chưa cấu hình kênh gửi mail (MAIL_WEBHOOK_URL hoặc RESEND_API_KEY)");
}

async function sendViaAppsScript(mail: Mail): Promise<void> {
  let res: Response;
  try {
    res = await fetch(requireEnv("MAIL_WEBHOOK_URL"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: requireEnv("MAIL_WEBHOOK_SECRET"), ...mail }),
      redirect: "follow", // Apps Script trả 302 sang script.googleusercontent.com
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (e) {
    throw new MailError(`Không gọi được Apps Script: ${(e as Error).message}`);
  }

  const text = await res.text();
  let data: { ok?: boolean; error?: string };
  try {
    data = JSON.parse(text);
  } catch {
    // Thường là trang HTML đăng nhập Google: web app chưa đặt "Who has access: Anyone".
    throw new MailError(`Apps Script trả về không phải JSON (HTTP ${res.status}); kiểm tra quyền truy cập của web app`);
  }
  if (!data.ok) throw new MailError(`Apps Script từ chối: ${data.error ?? "không rõ lý do"}`);
}

async function sendViaResend(mail: Mail): Promise<void> {
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${requireEnv("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: requireEnv("RESEND_FROM"), to: [mail.to], subject: mail.subject, html: mail.html }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (e) {
    throw new MailError(`Không gọi được Resend: ${(e as Error).message}`);
  }
  if (!res.ok) throw new MailError(`Resend trả về HTTP ${res.status}`);
}
