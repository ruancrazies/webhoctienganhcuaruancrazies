"use client";

import { useState, useTransition } from "react";
import { setAccentAction } from "@/app/(app)/profile/actions";

export type AccentOption = { id: string; name: string };

/** Áp ngay trên thiết bị (CSS của mọi màu đã có trong trang Cài đặt); server kiểm lại rồi ghi vào tài khoản. */
function applyAccent(id: string | null): void {
  const d = document.documentElement;
  if (id) d.dataset.accent = id;
  else delete d.dataset.accent;
}

/**
 * Chọn màu nhấn: nhóm nút bật/tắt (aria-pressed) cùng kiểu `.pill` của app. Tên màu luôn hiện bằng chữ; ô màu chỉ là phụ.
 * Server từ chối hoặc mất mạng → trả về lựa chọn trước và báo lỗi bằng chữ (vùng role="status" để screen reader đọc).
 */
export function AccentPicker({ options, initial }: { options: AccentOption[]; initial: string | null }) {
  const [value, setValue] = useState<string | null>(initial);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const choose = (id: string | null) => {
    if (id === value || pending) return;
    const previous = value;
    applyAccent(id);
    setValue(id);
    setMsg("");
    start(async () => {
      let ok = false;
      let error = "Không lưu được, thử lại sau.";
      try {
        const r = await setAccentAction({ id });
        ok = r.ok;
        if (!r.ok) error = r.error;
      } catch {
        /* mất mạng: giữ thông báo mặc định */
      }
      if (ok) setMsg(id ? `Đã đổi màu nhấn: ${options.find((o) => o.id === id)?.name ?? id}.` : "Đã dùng màu nhấn của giao diện.");
      else {
        applyAccent(previous);
        setValue(previous);
        setMsg(error);
      }
    });
  };

  return (
    <div>
      <b id="accent-label">Màu nhấn</b>
      <p className="muted">Đổi màu nút và liên kết; chữ vẫn đủ rõ ở mọi giao diện.</p>
      <div className="accent-pick" role="group" aria-labelledby="accent-label">
        <button type="button" className="pill" aria-pressed={value === null} onClick={() => choose(null)}>
          <span className="swatch" aria-hidden="true" />
          Theo giao diện
        </button>
        {options.map((o) => (
          <button key={o.id} type="button" className="pill" aria-pressed={value === o.id} onClick={() => choose(o.id)}>
            <span className="swatch" data-accent-swatch={o.id} aria-hidden="true" />
            {o.name}
          </button>
        ))}
      </div>
      <p className="small muted" role="status">{msg}</p>
    </div>
  );
}
