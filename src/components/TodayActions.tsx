import Link from "next/link";
import type { ActionView } from "@/types/api";

const ICON: Record<ActionView["reason"], string> = {
  due_backlog: "🔁",
  weak_grammar_topic: "🧩",
  weak_skill: "🎯",
  exam_gap: "📚",
  ready_for_exam: "📝",
  streak_risk: "🔥",
  long_absence: "👋",
};

/** "Hôm nay nên học gì": tối đa 3 gợi ý theo luật, mỗi gợi ý nói rõ lý do bằng số liệu của chính người học. */
export function TodayActions({ actions, showAll = false }: { actions: ActionView[]; showAll?: boolean }) {
  if (actions.length === 0) return null;
  return (
    <section className="sheet" aria-labelledby="ta-h">
      <div className="spread" style={{ marginBottom: 8 }}>
        <h2 id="ta-h">Hôm nay nên học gì</h2>
        {showAll ? null : <Link href="/insights" className="muted small">Xem hồ sơ năng lực ›</Link>}
      </div>
      <ul className="actions">
        {actions.map((a) => (
          <li key={a.reason}>
            <Link href={a.href} className="action">
              <span className="action-ico" aria-hidden="true">{ICON[a.reason]}</span>
              <span className="action-body">
                <b>{a.title}</b>
                <span className="muted small">{a.why}</span>
              </span>
              <span className="lv-go" aria-hidden="true">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
