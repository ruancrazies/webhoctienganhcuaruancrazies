"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { fmtNumber } from "@/lib/format";
import { GAMES, learnHref, playHref } from "@/games/registry";
import type { HomeDomain, HomeTopic } from "@/types/api";

type Pick = { by: "all" } | { by: "domain"; code: string } | { by: "topic"; slug: string };

/** Chọn phạm vi (cả cấp / lĩnh vực / chủ đề) rồi vào Học hoặc chơi một trò. */
export function LevelScopePicker({ cefr, domains, topics }: { cefr: string; domains: HomeDomain[]; topics: HomeTopic[] }) {
  const hasGeneral = domains.some((d) => d.code === "general");
  const [pick, setPick] = useState<Pick>(hasGeneral ? { by: "domain", code: "general" } : { by: "all" });
  const domainTitle = useMemo(() => new Map(domains.map((d) => [d.code, d.title])), [domains]);

  const scope = pick.by === "topic" ? { cefr, topic: pick.slug } : { cefr, domain: pick.by === "domain" ? pick.code : "all" };
  const label =
    pick.by === "all" ? "Tất cả lĩnh vực" : pick.by === "domain" ? (domainTitle.get(pick.code) ?? pick.code) : (topics.find((t) => t.slug === pick.slug)?.title ?? pick.slug);
  const isTopic = pick.by === "topic";

  if (domains.length === 0 && topics.length === 0) {
    return (
      <section className="sheet sheet-plain state">
        <div className="big" aria-hidden="true">📭</div>
        <h2>Cấp này chưa có từ vựng</h2>
        <p className="muted">Nội dung sẽ xuất hiện sau khi được nạp từ Google Sheet.</p>
      </section>
    );
  }

  return (
    <>
      <section className="sheet sheet-plain stack" aria-labelledby="sc-h">
        <h2 id="sc-h">Chọn phạm vi</h2>
        <div className="scope" role="group" aria-label="Lĩnh vực">
          <button type="button" className="pill" aria-pressed={pick.by === "all"} onClick={() => setPick({ by: "all" })}>
            Tất cả
          </button>
          {domains.map((d) => (
            <button key={d.code} type="button" className="pill" aria-pressed={pick.by === "domain" && pick.code === d.code} onClick={() => setPick({ by: "domain", code: d.code })}>
              {d.emoji ? `${d.emoji} ` : ""}{d.title}
              <small>{fmtNumber(d.total)}</small>
            </button>
          ))}
        </div>
        {topics.length > 0 ? (
          <>
            <p className="muted small">Hoặc chọn một chủ đề</p>
            <div className="scope" role="group" aria-label="Chủ đề">
              {topics.map((t) => (
                <button key={t.slug} type="button" className="pill" aria-pressed={pick.by === "topic" && pick.slug === t.slug} onClick={() => setPick({ by: "topic", slug: t.slug })}>
                  {t.emoji ? `${t.emoji} ` : ""}{t.title}
                  <small>{fmtNumber(t.total)}</small>
                </button>
              ))}
            </div>
          </>
        ) : null}
        <p className="small">
          Đang chọn: <b>{label}</b>
        </p>
      </section>

      <section className="cta-row" aria-label="Học từ vựng">
        <Link href={learnHref(scope, "new")} className="cta is-primary">
          <b>🌱 Học từ mới</b>
          <span className="muted">Mỗi lượt 50 từ chưa học: nghĩa, phiên âm, câu ví dụ; đánh dấu từ đã học</span>
        </Link>
        <Link href={learnHref(scope, "review")} className="cta">
          <b>🔁 Ôn lại từ cũ</b>
          <span className="muted">Xem lại các từ đã học, từ đến hạn ôn hiện lên trước</span>
        </Link>
      </section>

      <section className="stack" aria-labelledby="g-h">
        <div className="spread">
          <h2 id="g-h">Trò chơi</h2>
          <span className="muted small">XP tính trên mỗi câu đúng</span>
        </div>
        <div className="games">
          {GAMES.map((g) => {
            const blocked = isTopic && g.levelOnly;
            const off = !g.ready || blocked;
            const inner = (
              <>
                <span className="ge" aria-hidden="true">{g.emoji}</span>
                <b>{g.name}</b>
                <span className="muted">{g.blurb}</span>
                <span className="tag chip chip-mark">+{g.xp}</span>
                {!g.ready ? <span className="small muted">Sắp ra mắt</span> : blocked ? <span className="small muted">Chỉ chơi theo cấp</span> : null}
              </>
            );
            return off ? (
              <div key={g.id} className="game off" aria-disabled="true">{inner}</div>
            ) : (
              <Link key={g.id} href={playHref(g.id, scope)} className="game">{inner}</Link>
            );
          })}
        </div>
      </section>
    </>
  );
}
