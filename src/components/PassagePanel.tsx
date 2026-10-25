"use client";

import { useEffect, useRef, useState } from "react";
import type { ClientPassage, RevealedPassage } from "@/core/types";

const SKILL_LABEL = { reading: "Bài đọc", listening: "Bài nghe" } as const;

/** Tách lời thoại thành các đoạn ngắn: Chrome tự dừng giọng đọc nếu một lần đọc quá dài. */
const chunks = (text: string) => text.split(/\n+/).flatMap((line) => line.match(/[^.!?]+[.!?]*\s*/g) ?? [line]).map((s) => s.trim()).filter(Boolean);

function useSpeech(text: string) {
  const [playing, setPlaying] = useState(false);
  const run = useRef(0); // đổi số này để hủy chuỗi đang đọc

  const stop = () => {
    run.current += 1;
    setPlaying(false);
    try {
      speechSynthesis.cancel();
    } catch {
      /* bỏ qua */
    }
  };

  const play = (rate: number) => {
    if (typeof speechSynthesis === "undefined") return;
    stop();
    const mine = run.current;
    const parts = chunks(text);
    const voices = speechSynthesis.getVoices();
    const voice = voices.find((v) => v.lang.toLowerCase().startsWith("en-us")) ?? voices.find((v) => v.lang.toLowerCase().startsWith("en"));
    const next = (i: number) => {
      if (run.current !== mine) return;
      if (i >= parts.length) {
        setPlaying(false);
        return;
      }
      const u = new SpeechSynthesisUtterance(parts[i]);
      u.lang = "en-US";
      u.rate = rate;
      if (voice) u.voice = voice;
      u.onend = () => next(i + 1);
      u.onerror = () => setPlaying(false);
      speechSynthesis.speak(u);
    };
    setPlaying(true);
    next(0);
  };

  useEffect(() => stop, []); // chỉ dọn (hủy giọng đọc) khi rời bài
  return { playing, play, stop };
}

function Listening({ passage }: { passage: ClientPassage }) {
  const { playing, play, stop } = useSpeech(passage.speech ?? "");
  return (
    <div className="stack" style={{ gap: 10 }}>
      {passage.audioUrl ? (
        <audio controls preload="none" src={passage.audioUrl} style={{ width: "100%" }} />
      ) : (
        <div className="row">
          <button type="button" className="btn" onClick={() => play(0.9)} disabled={playing}>🔊 Nghe</button>
          <button type="button" className="btn btn-light" onClick={() => play(0.7)} disabled={playing}>🐢 Nghe chậm</button>
          {playing ? <button type="button" className="btn btn-light" onClick={stop}>⏹ Dừng</button> : null}
        </div>
      )}
      <p className="muted small">Bạn nghe lại được nhiều lần. Lời thoại sẽ hiện sau khi nộp bài.</p>
    </div>
  );
}

/** Đoạn văn (bài đọc) hoặc trình phát (bài nghe) hiển thị phía trên các câu hỏi của nó. */
export function PassagePanel({ passage }: { passage: ClientPassage }) {
  return (
    <section className="sheet passage" aria-label={`${SKILL_LABEL[passage.skill]}: ${passage.title}`}>
      <p className="q-kind">{SKILL_LABEL[passage.skill]}</p>
      <h3 className="passage-title">{passage.title}</h3>
      {passage.skill === "reading" ? <p className="passage-text">{passage.text}</p> : <Listening passage={passage} />}
    </section>
  );
}

/** Sau khi nộp: xem lại đoạn văn / lời thoại đầy đủ. */
export function PassageReveal({ passages }: { passages: RevealedPassage[] }) {
  if (passages.length === 0) return null;
  return (
    <section className="stack" aria-labelledby="ps-h">
      <h2 id="ps-h">Bài đọc và bài nghe trong đề</h2>
      {passages.map((p) => (
        <details key={p.id} className="sheet sheet-plain passage-reveal">
          <summary><b>{SKILL_LABEL[p.skill]}</b>: {p.title}</summary>
          <p className="passage-text">{p.body}</p>
        </details>
      ))}
    </section>
  );
}
