"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { QuestId, QuestView } from "@/core/quests";
import { apiPost, errorMessage } from "@/lib/api";
import { fmtNumber, ratio } from "@/lib/format";
import type { ClaimQuestResponse, QuestsResponse } from "@/types/api";

function QuestRow({ q, busy, onClaim }: { q: QuestView; busy: boolean; onClaim: (id: QuestId) => void }) {
  return (
    <li className="stack" style={{ gap: 6 }}>
      <div className="spread">
        <b>{q.title}</b>
        <span className="chip chip-plain">+{fmtNumber(q.reward)} XP</span>
      </div>
      <div className="bar bar-mark" role="progressbar" aria-valuemin={0} aria-valuemax={q.target} aria-valuenow={q.progress} aria-label={q.title}>
        <i style={{ width: `${ratio(q.progress, q.target) * 100}%` }} />
      </div>
      <div className="spread small">
        <span className="muted">
          {q.id === "all" ? `${q.progress}/${q.target} nhiệm vụ` : `${fmtNumber(q.progress)}/${fmtNumber(q.target)}`}
        </span>
        {q.claimed ? (
          <span className="chip chip-good">✓ Đã nhận</span>
        ) : q.done ? (
          <button type="button" className="btn btn-mark btn-sm" disabled={busy} onClick={() => onClaim(q.id)}>
            {busy ? "Đang nhận…" : "Nhận thưởng"}
          </button>
        ) : (
          <span className="muted">Chưa hoàn thành</span>
        )}
      </div>
    </li>
  );
}

/** Thẻ "Nhiệm vụ hôm nay" ở trang chủ. Dữ liệu ban đầu do server đưa vào; bấm "Nhận thưởng" gọi API rồi làm mới XP/level. */
export function DailyQuests({ initial }: { initial: QuestsResponse }) {
  const router = useRouter();
  const [quests, setQuests] = useState<QuestView[]>(initial.quests);
  const [bonus, setBonus] = useState<QuestView>(initial.bonus);
  const [busy, setBusy] = useState<QuestId | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function claim(id: QuestId) {
    if (busy) return;
    setBusy(id);
    setNote(null);
    try {
      const r = await apiPost<ClaimQuestResponse>("/api/quests/claim", { quest: id });
      const mark = (q: QuestView): QuestView => (q.id === id ? { ...q, claimed: true } : q);
      setQuests((qs) => qs.map(mark));
      setBonus(mark);
      setNote({ ok: true, text: `Đã nhận +${fmtNumber(r.reward)} XP` });
      router.refresh(); // cập nhật tổng XP / level ở trang
    } catch (e) {
      setNote({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="sheet" aria-labelledby="dq-h">
      <div className="spread" style={{ marginBottom: 10 }}>
        <h2 id="dq-h">Nhiệm vụ hôm nay</h2>
        <span className="muted small">Làm mới lúc 00:00 giờ Việt Nam</span>
      </div>
      <ul className="stack" style={{ gap: 16, listStyle: "none", padding: 0, margin: 0 }}>
        {quests.map((q) => (
          <QuestRow key={q.id} q={q} busy={busy === q.id} onClaim={claim} />
        ))}
        <QuestRow q={bonus} busy={busy === bonus.id} onClaim={claim} />
      </ul>
      <p role="status" className={note ? `small ${note.ok ? "gate gate-ok" : "gate gate-bad"}` : "muted small"} style={{ marginTop: 12 }}>
        {note ? note.text : "Thưởng nhiệm vụ không tính vào giới hạn XP mỗi ngày."}
      </p>
    </section>
  );
}
