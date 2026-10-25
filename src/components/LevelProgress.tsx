import { fmtNumber } from "@/lib/format";
import { xpLevelOf } from "@/core/xpLevel";

/** Huy hiệu Level + thanh tiến độ tới level kế (tính từ tổng XP). Dùng được cả ở server lẫn client component. */
export function LevelProgress({ xp }: { xp: number }) {
  const lv = xpLevelOf(xp);
  return (
    <div className="today">
      <div className="spread small">
        <span>
          <span className="chip chip-mark">Level {lv.level}</span>
        </span>
        <span className="muted">
          {lv.maxed ? "Đã đạt level tối đa" : `${fmtNumber(lv.into)} / ${fmtNumber(lv.need ?? 0)} XP · còn ${fmtNumber(lv.toNext)} XP để lên Level ${lv.level + 1}`}
        </span>
      </div>
      <div
        className="bar bar-mark"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={lv.need ?? lv.into}
        aria-valuenow={lv.into}
        aria-label={`Tiến độ Level ${lv.level}`}
      >
        <i style={{ width: `${lv.ratio * 100}%` }} />
      </div>
    </div>
  );
}
