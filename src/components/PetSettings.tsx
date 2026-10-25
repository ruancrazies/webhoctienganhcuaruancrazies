"use client";

import { useSyncExternalStore } from "react";
import { isPetsOn, petSay, setPetsOn, subscribePets } from "@/lib/pets";

/** Cài đặt thú cưng trên trang hồ sơ: một công tắc duy nhất cho pet nền + lời nhắc/gợi ý. */
export function PetSettings() {
  const on = useSyncExternalStore(subscribePets, isPetsOn, () => true);
  return (
    <div className="toggle">
      <div>
        <b>Thú cưng trợ lý</b>
        <p className="muted">Nuonuo và Phoebe ở cuối màn hình, kèm lời chào, nhắc nghỉ và gợi ý học</p>
      </div>
      <div className="row-gap">
        <button
          type="button"
          className="btn btn-light btn-sm"
          disabled={!on}
          onClick={() => petSay({ text: "Mình là trợ lý của bạn đây! Mình sẽ nhắc bạn ôn bài và nghỉ ngơi nhé.", ttl: 6000 })}
        >
          Thử
        </button>
        <button type="button" className="btn btn-light btn-sm" aria-pressed={on} onClick={() => setPetsOn(!on)}>
          {on ? "Đang bật" : "Đang tắt"}
        </button>
      </div>
    </div>
  );
}
