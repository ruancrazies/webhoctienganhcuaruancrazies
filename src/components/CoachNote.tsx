"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { usePersonalize } from "@/lib/aiPrefs";
import type { CoachResponse } from "@/types/api";

/**
 * Lời nhắn coach hôm nay (giai đoạn 3). Tải sau khi trang đã hiện để không làm chậm trang chủ khi Gemini phản hồi chậm.
 * Lỗi mạng/máy chủ thì ẩn lặng lẽ: kế hoạch "Hôm nay nên học gì" bên dưới đã đủ dùng mà không cần lời nhắn.
 */
export function CoachNote() {
  const [personalize, setPersonalize, ready] = usePersonalize();
  const [coach, setCoach] = useState<CoachResponse | null>(null);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    apiGet<CoachResponse>(`/api/insights/coach?ai=${personalize ? 1 : 0}`)
      .then((r) => { if (alive) setCoach(r); })
      .catch(() => { if (alive) setCoach(null); });
    return () => { alive = false; };
  }, [personalize, ready]);

  if (!coach) return null;
  return (
    <section className="coach" aria-label="Lời nhắn hôm nay">
      <p className="coach-msg">💬 {coach.message}</p>
      <p className="muted small coach-note">
        {coach.source === "ai"
          ? "AI viết từ bản tóm tắt ẩn danh về kết quả học của bạn (không có tên hay email)."
          : personalize
            ? "Lời nhắn tự động theo kết quả học của bạn."
            : "Đang tắt cá nhân hoá bằng AI: không gửi gì sang Google."}{" "}
        <button type="button" className="linkbtn" onClick={() => setPersonalize(!personalize)}>
          {personalize ? "Tắt cá nhân hoá AI" : "Bật lại cá nhân hoá AI"}
        </button>
      </p>
    </section>
  );
}
