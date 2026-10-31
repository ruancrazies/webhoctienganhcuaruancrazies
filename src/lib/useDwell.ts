"use client";

import { useEffect, useRef } from "react";
import { DwellTracker } from "@/core/dwell";

/**
 * Đồng hồ "câu hiện trên màn hình" cho một màn làm bài. Tự dừng khi tab bị ẩn (document.visibilityState).
 * Dùng: `dwell.show(qid)` mỗi khi câu mới hiện; `dwell.ms(qid)` lúc trả lời / nộp.
 * Đo bằng performance.now() (đơn điệu, không bị ảnh hưởng khi người dùng chỉnh giờ máy).
 */
export function useDwell(): DwellTracker {
  const ref = useRef<DwellTracker | null>(null);
  if (ref.current === null) ref.current = new DwellTracker(() => performance.now());
  const tracker = ref.current;

  useEffect(() => {
    const onVis = () => tracker.setVisible(document.visibilityState !== "hidden");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [tracker]);

  return tracker;
}
