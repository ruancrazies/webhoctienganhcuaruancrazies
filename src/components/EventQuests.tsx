"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { claimEventTaskAction } from "@/app/(app)/quests/actions";
import { isClaimable, rewardText, type EventPhase, type TaskView } from "@/core/seasonEvents";
import { RARITY_LABEL } from "@/cosmetics/core/define";
import { fmtNumber, ratio } from "@/lib/format";
import { Icon } from "@/components/Icon";
import type { CosmeticKind } from "@/core/cosmetics";

const KIND_LABEL: Record<CosmeticKind, string> = { theme: "Giao diện", avatar: "Avatar", frame: "Khung" };
const PHASE_CHIP: Record<string, { text: string; cls: string }> = {
  running: { text: "Đang diễn ra", cls: "chip chip-good" },
  claiming: { text: "Còn nhận thưởng", cls: "chip chip-warn" },
  scheduled: { text: "Sắp diễn ra", cls: "chip chip-plain" },
};

/** Dữ liệu một đợt đã được server dựng sẵn (chữ, giờ VN, đếm ngược): client chỉ hiển thị và gọi server. */
export type EventCardData = {
  key: string;
  name: string;
  blurb: string | null;
  phase: Exclude<EventPhase, "draft" | "ended">;
  countdown: string;
  lastDay: string;
  tasks: TaskView[];
  /** Ảnh đại diện cho món thưởng (server dựng, vì Avatar dùng registry): id món → hình. */
  art?: Record<string, React.ReactNode>;
};

function Reward({ t, art }: { t: TaskView; art?: React.ReactNode }) {
  const text = rewardText(t, (r) => RARITY_LABEL[r], (k) => KIND_LABEL[k]);
  return (
    <span className="ev-reward">
      {art ? <span className="ev-art" aria-hidden="true">{art}</span> : null}
      <span>{text}</span>
    </span>
  );
}

/** Một đợt sự kiện: tiêu đề + đếm ngược + danh sách nhiệm vụ. `preview` = trang quản trị (không gọi server). */
export function EventCard({ ev, preview = false }: { ev: EventCardData; preview?: boolean }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskView[]>(ev.tasks);
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string; href?: string } | null>(null);
  const chip = PHASE_CHIP[ev.phase]!;
  const hid = `ev-${ev.key}`;

  async function claim(t: TaskView) {
    if (busy !== null || preview) return;
    setBusy(t.id);
    setNote(null);
    const r = await claimEventTaskAction({ taskId: t.id }).catch(() => null);
    setBusy(null);
    if (!r) return setNote({ ok: false, text: "Hệ thống đang bận, vui lòng thử lại sau." });
    if (!r.ok) return setNote({ ok: false, text: r.error });
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, claimed: true, done: true } : x)));
    const parts: string[] = [];
    if (r.rewardXp > 0) parts.push(`+${fmtNumber(r.rewardXp)} XP`);
    if (r.cosmetic) parts.push(r.cosmetic.granted ? `“${r.cosmetic.name}” đã vào Bộ sưu tập` : `Bạn đang có “${r.cosmetic.name}” rồi nên không gia hạn thêm`);
    setNote({ ok: true, text: `Đã nhận: ${parts.join(" · ")}.`, href: r.cosmetic?.granted ? `/profile/collection?tab=${r.cosmetic.kind}` : undefined });
    router.refresh();
  }

  return (
    <section className="sheet" aria-labelledby={`${hid}-h`}>
      <div className="spread" style={{ marginBottom: 6 }}>
        <h2 id={`${hid}-h`}>{ev.name}</h2>
        <span className={chip.cls}>{chip.text}</span>
      </div>
      {ev.blurb ? <p className="muted">{ev.blurb}</p> : null}
      <p className="small ev-count"><Icon name="clock" size={14} /> <b>{ev.countdown}</b>{ev.phase === "claiming" ? "" : ` · ngày cuối ${ev.lastDay}`}</p>

      <ul className="stack ev-tasks">
        {tasks.map((t) => {
          const can = isClaimable(t, ev.phase);
          return (
            <li key={t.id} className="stack" style={{ gap: 6 }}>
              <div className="spread">
                <b>{t.title}</b>
              </div>
              <Reward t={t} art={t.reward ? ev.art?.[t.reward.id] : undefined} />
              <div className="bar bar-mark" role="progressbar" aria-valuemin={0} aria-valuemax={t.target} aria-valuenow={t.progress} aria-label={t.title}>
                <i style={{ width: `${ratio(t.progress, t.target) * 100}%` }} />
              </div>
              <div className="spread small">
                <span className="muted">{t.metric === "all" ? `${t.progress}/${t.target} nhiệm vụ` : `${fmtNumber(t.progress)}/${fmtNumber(t.target)}`}</span>
                {t.claimed ? (
                  <span className="chip chip-good"><Icon name="check" size={14} /> Đã nhận</span>
                ) : can ? (
                  <button type="button" className="btn btn-mark btn-sm" disabled={busy !== null} onClick={() => claim(t)}>{busy === t.id ? "Đang nhận…" : "Nhận thưởng"}</button>
                ) : ev.phase === "scheduled" ? (
                  <span className="muted">Chưa bắt đầu</span>
                ) : ev.phase === "claiming" ? (
                  <span className="muted">Chưa đủ, đã hết giờ làm</span>
                ) : t.metric === "all" ? (
                  <span className="muted">Chưa hoàn thành</span>
                ) : (
                  <Link href={t.metric === "test" ? "/test" : "/"} className="btn btn-light btn-sm">Làm ngay</Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p role="status" aria-live="polite" className={note ? `small ${note.ok ? "gate gate-ok" : "gate gate-bad"}` : "muted small"} style={{ marginTop: 12 }}>
        {note ? note.text : "Thưởng sự kiện không tính vào giới hạn XP mỗi ngày."}
        {note?.href ? <> <Link href={note.href}>Mở Bộ sưu tập</Link></> : null}
      </p>
    </section>
  );
}
