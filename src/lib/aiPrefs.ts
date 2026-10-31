"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Cá nhân hoá bằng AI (giai đoạn 3): cho phép gửi BẢN TÓM TẮT ẨN DANH về kết quả học (không có tên, email hay id) sang Gemini
 * để pet và coach nói đúng chỗ mình yếu. Mặc định BẬT; người học tắt được ngay ở khung chat và ở lời nhắn coach.
 *
 * Chỉ là tuỳ chọn giao diện nên lưu ở localStorage của trình duyệt này (như tắt âm, giao diện tối): đổi máy thì đặt lại.
 * Máy chủ tôn trọng cờ qua `personalize` (chat) và `ai` (coach); tắt thì không gửi gì sang Gemini.
 */
const KEY = "eg-ai-personalize";
const EVENT = "eg-ai-personalize-change";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

export function setPersonalize(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* trình duyệt chặn lưu: giá trị chỉ còn trong phiên này */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** [bật/tắt, đổi]. Giá trị đầu là true cho tới khi đọc xong localStorage (tránh lệch giữa server và client khi hydrate). */
export function usePersonalize(): [boolean, (on: boolean) => void, boolean] {
  const [on, setOn] = useState(true);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => setOn(read());
    sync();
    setReady(true);
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return [on, useCallback((v: boolean) => setPersonalize(v), []), ready];
}
