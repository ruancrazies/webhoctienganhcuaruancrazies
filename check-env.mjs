import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const key = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
console.log("URL trong .env.local         :", url);
console.log("Độ dài khóa (đúng là 164)    :", key.length);
console.log("Biến môi trường của shell    :", process.env.SUPABASE_SERVICE_ROLE_KEY ? "ĐANG ĐẶT (sẽ đè .env.local!)" : "không đặt (tốt)");
try {
  const [h, p, s] = key.split(".");
  console.log("role trong khóa              :", JSON.parse(Buffer.from(p, "base64url")).role);
  console.log("chữ ký khớp JWT_SECRET       :", createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url") === s);
} catch {
  console.log("Khóa không phải JWT hợp lệ (sai định dạng / bị cắt).");
}
try {
  const r = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  console.log("Gọi thử REST với khóa này    : HTTP", r.status, (await r.text()).slice(0, 120));
} catch (e) {
  console.log("Không gọi được REST:", String(e));
}