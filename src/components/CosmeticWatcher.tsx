"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { pollCosmeticsAction } from "@/app/(app)/profile/actions";
import { isPetsOn, petSay } from "@/lib/pets";
import { applyServerTheme, getCookieTheme, themeChangeSeq } from "@/lib/theme";

/** Hỏi server tối đa mỗi phút một lần (đổi trang liên tục cũng không dồn lệnh gọi). */
const MIN_GAP_MS = 60_000;

/**
 * Việc nền của khung (app), không vẽ gì: (1) server cấp món theo level mới đạt và đồng bộ theme theo TÀI KHOẢN
 * (đổi ở thiết bị khác thì thiết bị này theo), (2) thú cưng báo mở khóa / sắp hết hạn / hết hạn đúng một lần.
 * Chạy khi vào app, khi đổi trang và khi quay lại tab. Lỗi mạng bỏ qua êm: không bao giờ làm phiền người dùng.
 * Thú cưng tắt thì không đánh dấu "đã báo" (để không mất); món mới vẫn hiện nhãn "Mới" ở Bộ sưu tập.
 */
export function CosmeticWatcher() {
  const path = usePathname();
  const router = useRouter();
  const last = useRef(0);
  const busy = useRef(false);

  const run = useCallback(async () => {
    if (busy.current || Date.now() - last.current < MIN_GAP_MS) return;
    busy.current = true;
    last.current = Date.now();
    const seq = themeChangeSeq();
    try {
      const r = await pollCosmeticsAction(isPetsOn());
      // Server đã đánh dấu "đã báo" nên không cần chống lặp ở đây (nhận lại món sau khi hết hạn phải được báo lại).
      for (const m of r.messages) petSay({ text: m.text, id: m.id, ttl: 9000 });
      // Người dùng vừa tự đổi theme trong lúc chờ → bỏ kết quả cũ, đừng đè lên lựa chọn mới.
      const theme = r.theme;
      const themeChanged = theme !== null && seq === themeChangeSeq() && getCookieTheme() !== theme;
      const needsCss = themeChanged && !applyServerTheme(theme);
      if (needsCss || r.changed) router.refresh();
    } catch {
      /* bỏ qua */
    } finally {
      busy.current = false;
    }
  }, [router]);

  useEffect(() => {
    void run();
  }, [path, run]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [run]);

  return null;
}
