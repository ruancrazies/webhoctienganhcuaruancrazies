/** In ra các secret cần cho Bước 3. Chạy: npm run auth:secrets (KHÔNG commit kết quả). */
import { randomBytes } from "node:crypto";

// Supabase yêu cầu secret của Send Email Hook có dạng v1,whsec_<base64>
const hookSecret = `v1,whsec_${randomBytes(32).toString("base64")}`;
const mailSecret = randomBytes(24).toString("hex");

console.log(`# Dán vào .env.local và vào Environment Variables của Vercel
SEND_EMAIL_HOOK_SECRET=${hookSecret}
MAIL_WEBHOOK_SECRET=${mailSecret}

# - SEND_EMAIL_HOOK_SECRET: dán CÙNG giá trị vào Supabase Dashboard > Authentication > Hooks > Send Email (ô Secret)
# - MAIL_WEBHOOK_SECRET:    dán CÙNG giá trị vào Script Properties của Apps Script (khóa MAIL_WEBHOOK_SECRET)`);
