"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { learnHref } from "@/games/registry";
import { ApiFail, apiGet, apiPost, errorMessage } from "@/lib/api";
import { STATE_LABEL, fmtNumber, posLabel } from "@/lib/format";
import { sfx, speak } from "@/lib/sound";
import type { LearnCard, LearnMode, LearnPage, LearnState } from "@/types/api";

const STATE_CHIP: Record<LearnState, string> = { new: "chip", learned: "chip chip-warn", due: "chip chip-red", mastered: "chip chip-good" };

type Props = { cefr: string; topic?: string; domain: string; mode: LearnMode };

export function LearnList({ cefr, topic, domain, mode }: Props) {
  const [items, setItems] = useState<LearnCard[]>([]);
  /** Con trỏ tới lượt SAU (undefined = đã tới cuối danh sách). */
  const [cursor, setCursor] = useState<string | undefined>();
  /** Lượt đang hiển thị bắt đầu từ đầu danh sách (không có con trỏ). */
  const [fromStart, setFromStart] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ApiFail | null>(null);
  const [saving, setSaving] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const reqId = useRef(0);
  /** Từ vừa bấm "Đã học" nhưng chưa gửi lên server: wordId → trạng thái trước đó (để hoàn lại nếu lỗi). */
  const pending = useRef(new Map<number, LearnState>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const query = useCallback(
    (c?: string) => {
      const q = new URLSearchParams();
      if (topic) q.set("topic", topic);
      else {
        q.set("cefr", cefr);
        q.set("domain", domain);
      }
      q.set("mode", mode);
      if (c) q.set("cursor", c);
      return `/api/learn/words?${q.toString()}`;
    },
    [cefr, topic, domain, mode],
  );

  /** Lấy một lượt 50 từ và THAY danh sách hiện tại bằng nó (không nối dài). `c` rỗng = từ đầu danh sách. */
  const load = useCallback(
    async (c?: string, isRefresh = false) => {
      const id = ++reqId.current;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const page = await apiGet<LearnPage>(query(c));
        if (id !== reqId.current) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setFromStart(!c);
        if (isRefresh) window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (e) {
        if (id === reqId.current) setError(e instanceof ApiFail ? e : new ApiFail(0, "ERROR", errorMessage(e)));
      } finally {
        if (id === reqId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [query],
  );

  useEffect(() => {
    void load();
    return () => {
      reqId.current++;
    };
  }, [load]);

  const markable = useMemo(() => items.filter((w) => w.state === "new" || w.state === "due"), [items]);
  const learnedCount = items.length - markable.length;

  /** Gửi các từ đang chờ lên server (gom lô ≤ 50 từ/lần để không chạm giới hạn tần suất). */
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const batch = [...pending.current.entries()];
    pending.current.clear();
    if (batch.length === 0) return;
    setSaving((n) => n + 1);
    let confirmed = 0;
    try {
      for (let i = 0; i < batch.length; i += 50) {
        const chunk = batch.slice(i, i + 50);
        await apiPost<{ marked: number }>("/api/learn/mark", { wordIds: chunk.map(([id]) => id) });
        confirmed = i + chunk.length;
      }
    } catch (e) {
      // hoàn lại những từ chưa được lưu
      const failed = new Map(batch.slice(confirmed));
      setItems((prev) => prev.map((w) => (failed.has(w.wordId) ? { ...w, state: failed.get(w.wordId)! } : w)));
      setNote(`${errorMessage(e)}. Một số từ chưa được lưu, hãy thử lại.`);
    } finally {
      setSaving((n) => n - 1);
    }
  }, []);

  /** Đánh dấu "đã học": đổi giao diện ngay, gửi server sau ~1,2 giây (hoặc ngay với `now`). */
  const mark = useCallback(
    (ids: number[], now = false) => {
      if (ids.length === 0) return;
      setNote(null);
      const idSet = new Set(ids);
      setItems((prev) => {
        for (const w of prev) if (idSet.has(w.wordId) && !pending.current.has(w.wordId) && (w.state === "new" || w.state === "due")) pending.current.set(w.wordId, w.state);
        return prev.map((w) => (idSet.has(w.wordId) && (w.state === "new" || w.state === "due") ? { ...w, state: "learned" } : w));
      });
      sfx("tap");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), now ? 0 : 1200);
    },
    [flush],
  );

  // rời trang / ẩn tab: gửi nốt những từ còn chờ
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      void flush();
    };
  }, [flush]);

  /** "Làm mới": lưu các từ vừa đánh dấu, rồi đổi sang 50 từ tiếp theo (hết danh sách thì quay lại từ đầu). */
  const refresh = useCallback(async () => {
    await flush();
    await load(cursor, true);
  }, [flush, load, cursor]);

  const hrefScope = topic ? { cefr, topic } : { cefr, domain };
  // Cả phạm vi chỉ có một lượt (≤ 50 từ): làm mới sẽ ra đúng danh sách cũ nên không hiện nút.
  const canRefresh = Boolean(cursor) || !fromStart;

  if (loading && items.length === 0) {
    return (
      <div className="stack" aria-busy="true" aria-label="Đang tải danh sách từ">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ height: 132 }} />
        ))}
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="sheet sheet-plain state" role="alert">
        <div className="big" aria-hidden="true">{error.status === 403 ? "🔒" : "😵"}</div>
        <h2>{error.status === 403 ? "Cấp này đang khóa" : "Không tải được danh sách"}</h2>
        <p className="muted">{error.message}</p>
        {error.status !== 403 ? <button type="button" className="btn" onClick={() => void load()}>Thử lại</button> : null}
      </div>
    );
  }

  if (items.length === 0) {
    return mode === "review" ? (
      <div className="sheet sheet-plain state">
        <div className="big" aria-hidden="true">🌱</div>
        <h2>Chưa có từ nào để ôn lại</h2>
        <p className="muted">Các từ bạn đã học hoặc đã chơi sẽ xuất hiện ở đây.</p>
        <Link href={learnHref(hrefScope, "new")} className="btn">Học từ mới</Link>
      </div>
    ) : (
      <div className="sheet sheet-plain state">
        <div className="big" aria-hidden="true">🎉</div>
        <h2>Không còn từ mới ở phạm vi này</h2>
        <p className="muted">Bạn đã học hết từ ở đây, hãy ôn lại hoặc chọn lĩnh vực/chủ đề khác.</p>
        <Link href={learnHref(hrefScope, "review")} className="btn">Ôn lại từ cũ</Link>
      </div>
    );
  }

  return (
    <>
      <div className="spread">
        <p className="muted">
          {fmtNumber(items.length)} từ, {fmtNumber(learnedCount)} từ đã học{saving > 0 ? ", đang lưu…" : ""}
        </p>
        <button type="button" className="btn btn-light btn-sm" disabled={markable.length === 0} onClick={() => mark(markable.map((w) => w.wordId), true)}>
          Đánh dấu cả danh sách đã học{markable.length > 0 ? ` (${markable.length})` : ""}
        </button>
      </div>
      {note ? <p className="err" role="alert">{note}</p> : null}

      <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0, opacity: refreshing ? 0.5 : 1 }} aria-busy={refreshing}>
        {items.map((w) => (
          <li key={w.wordId}>
            <article className={`wc s-${w.state}`} aria-label={w.en}>
              <div className="wc-top">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="wc-en">{w.en}</span>
                    <span className="chip chip-plain">{posLabel(w.pos)}</span>
                  </div>
                  {w.ipa ? <div className="wc-ipa">/{w.ipa.replace(/^\/|\/$/g, "")}/</div> : null}
                </div>
                <button type="button" className="icon-btn" onClick={() => speak(w.en, { force: true })} aria-label={`Nghe phát âm ${w.en}`}>
                  🔊
                </button>
              </div>
              <div>
                <div className="wc-vi">{w.vi}</div>
                {w.viAlt.length > 0 ? <div className="wc-alt">Nghĩa khác: {w.viAlt.join("; ")}</div> : null}
              </div>
              {w.examples.length > 0 ? (
                <div className="stack" style={{ gap: 8 }}>
                  {w.examples.map((ex, i) => (
                    <p key={i} className="ex">
                      <em>{ex.en}</em>
                      {ex.vi ? <span>{ex.vi}</span> : null}
                    </p>
                  ))}
                </div>
              ) : null}
              <div className="wc-foot">
                <span className={STATE_CHIP[w.state]}>{STATE_LABEL[w.state]}</span>
                {w.state === "new" || w.state === "due" ? (
                  <button type="button" className="btn btn-sm" onClick={() => mark([w.wordId])}>
                    Đã học
                  </button>
                ) : null}
              </div>
            </article>
          </li>
        ))}
      </ul>

      {error ? (
        <p className="err" role="alert">
          {error.message}
        </p>
      ) : null}
      {canRefresh ? (
        <button type="button" className="btn btn-light btn-block" disabled={refreshing} onClick={() => void refresh()}>
          {refreshing ? "Đang làm mới…" : cursor ? "🔄 Làm mới: 50 từ tiếp theo" : "🔄 Làm mới: quay lại từ đầu"}
        </button>
      ) : (
        <p className="muted small" style={{ textAlign: "center" }}>Đã hiển thị hết danh sách.</p>
      )}
    </>
  );
}
