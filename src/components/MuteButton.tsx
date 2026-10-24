"use client";

import { useSyncExternalStore } from "react";
import { isMuted, setMuted, subscribeMuted } from "@/lib/sound";

export function useMuted(): boolean {
  return useSyncExternalStore(subscribeMuted, isMuted, () => false);
}

export function MuteButton() {
  const muted = useMuted();
  return (
    <button
      type="button"
      className="mute"
      aria-pressed={muted}
      aria-label={muted ? "Bật âm thanh" : "Tắt âm thanh"}
      title={muted ? "Bật âm thanh" : "Tắt âm thanh"}
      onClick={() => setMuted(!muted)}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}

/** Công tắc đầy đủ cho trang hồ sơ. */
export function MuteToggle() {
  const muted = useMuted();
  return (
    <div className="toggle">
      <div>
        <b>Âm thanh</b>
        <p className="muted">Giọng đọc và âm hiệu ứng khi chơi</p>
      </div>
      <button type="button" className="btn btn-light btn-sm" aria-pressed={!muted} onClick={() => setMuted(!muted)}>
        {muted ? "Đang tắt" : "Đang bật"}
      </button>
    </div>
  );
}
