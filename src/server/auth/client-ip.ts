/** IP người gọi. Trên Vercel, x-forwarded-for do nền tảng đặt (phần tử đầu là IP thật). */
export function clientIp(h: Pick<Headers, "get">): string {
  const first = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = first || h.get("x-real-ip") || "unknown";
  return ip.slice(0, 64);
}
