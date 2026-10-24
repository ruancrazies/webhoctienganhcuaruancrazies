import { createHmac, timingSafeEqual } from "node:crypto";

/** Chữ ký Standard Webhooks (https://www.standardwebhooks.com) — Supabase ký Send Email Hook theo chuẩn này. */
export class HookSignatureError extends Error {}

type HeaderReader = Pick<Headers, "get">;

const TOLERANCE_SECONDS = 300;

/** Secret Supabase cấp có dạng `v1,whsec_<base64>`; phần khóa là base64 phía sau. */
function keyFromSecret(secret: string): Buffer {
  const b64 = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  const key = Buffer.from(b64, "base64");
  if (key.length === 0) throw new HookSignatureError("SEND_EMAIL_HOOK_SECRET không hợp lệ");
  return key;
}

/** Ném HookSignatureError nếu chữ ký sai / thiếu / quá hạn. `nowMs` để test. */
export function verifyHookSignature(
  rawBody: string,
  headers: HeaderReader,
  secret: string,
  nowMs: number = Date.now(),
): void {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (!id || !timestamp || !signatures) throw new HookSignatureError("Thiếu header chữ ký");

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) throw new HookSignatureError("Timestamp không hợp lệ");
  if (Math.abs(nowMs / 1000 - ts) > TOLERANCE_SECONDS) throw new HookSignatureError("Timestamp quá hạn");

  const expected = createHmac("sha256", keyFromSecret(secret))
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest();

  // Header có thể chứa nhiều chữ ký: "v1,<base64> v1,<base64>"
  for (const part of signatures.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const given = Buffer.from(sig, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return;
  }
  throw new HookSignatureError("Chữ ký không khớp");
}
