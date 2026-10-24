import { createHmac, randomBytes } from "node:crypto";

export const newSecret = () => `v1,whsec_${randomBytes(32).toString("base64")}`;

/** Ký như Supabase (Standard Webhooks) để test. */
export function sign(body: string, secret: string, opts: { id?: string; timestamp?: number } = {}) {
  const id = opts.id ?? "msg_test_1";
  const timestamp = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  const key = Buffer.from(secret.replace(/^v1,whsec_/, ""), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return new Headers({ "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": `v1,${sig}` });
}
