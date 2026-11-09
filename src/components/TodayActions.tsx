import Link from "next/link";
import type { ActionView } from "@/types/api";
import { Icon, type IconName } from "@/components/Icon";

const ICON: Record<ActionView["reason"], IconName> = {
  due_backlog: "repeat",
  weak_grammar_topic: "puzzle",
  weak_skill: "target",
  exam_gap: "book",
  ready_for_exam: "note",
  streak_risk: "flame",
  long_absence: "chat",
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
              <span className="action-ico" aria-hidden="true"><Icon name={ICON[a.reason]} size={22} /></span>
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
