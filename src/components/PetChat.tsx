"use client";

import { useEffect, useRef, useState } from "react";
import { CHAT_MAX_CHARS, PET_PERSONA, type ChatPet, type ChatTurn } from "@/core/chat";
import { apiPost, errorMessage } from "@/lib/api";
import { CHAT_OPEN_EVENT, isPetsOn, subscribePets, type PetWho } from "@/lib/pets";

type Bubble = ChatTurn & { id: number; error?: boolean };
const PETS: ChatPet[] = ["nuonuo", "phoebe"];

const HELLO: Record<ChatPet, string> = {
  nuonuo: "Chào bạn! Mình là Nuonuo. Bạn muốn hỏi từ vựng hay ngữ pháp gì nào?",
  phoebe: "Hế lô! Phoebe đây. Có gì khó cứ hỏi, mình giải thích cho — nhưng đừng mong mình dễ dãi nha 😏",
};

/** Bỏ ký hiệu markdown (**đậm**, *nghiêng*) vì khung chat hiển thị văn bản thuần. */
const plain = (t: string) => t.replace(/\*+/g, "");

/** Khung trò chuyện với thú cưng. Mở bằng cách bấm vào bé hoặc nút 💬; hội thoại giữ trong bộ nhớ trình duyệt (mất khi tải lại trang). */
export function PetChat() {
  const [open, setOpen] = useState(false);
  const [pet, setPet] = useState<ChatPet>("nuonuo");
  const [logs, setLogs] = useState<Record<ChatPet, Bubble[]>>({ nuonuo: [], phoebe: [] });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const logEl = useRef<HTMLDivElement>(null);
  const inputEl = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const who = (e as CustomEvent<{ who?: PetWho }>).detail?.who;
      if (who) setPet(who);
      setOpen(true);
    };
    window.addEventListener(CHAT_OPEN_EVENT, onOpen);
    // tắt thú cưng ở nơi khác thì đóng khung chat
    const unsub = subscribePets(() => { if (!isPetsOn()) setOpen(false); });
    return () => { window.removeEventListener(CHAT_OPEN_EVENT, onOpen); unsub(); };
  }, []);

  useEffect(() => {
    if (open) inputEl.current?.focus();
  }, [open, pet]);
  useEffect(() => {
    const el = logEl.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs, busy, open, pet]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  const name = PET_PERSONA[pet].name;
  const log = logs[pet];

  const send = async () => {
    const message = text.trim();
    if (!message || busy) return;
    const history: ChatTurn[] = log.filter((b) => !b.error).map(({ role, text: t }) => ({ role, text: t }));
    const add = (b: Omit<Bubble, "id">) => setLogs((cur) => ({ ...cur, [pet]: [...cur[pet], { ...b, id: ++seq.current }] }));
    add({ role: "user", text: message });
    setText("");
    setBusy(true);
    try {
      const r = await apiPost<{ reply: string }>("/api/chat", { pet, message, history });
      add({ role: "pet", text: r.reply });
    } catch (e) {
      add({ role: "pet", text: errorMessage(e), error: true });
    } finally {
      setBusy(false);
      inputEl.current?.focus();
    }
  };

  return (
    <section className="pchat" role="dialog" aria-label={`Trò chuyện với ${name}`}>
      <div className="pchat-head">
        <b>💬 {name}</b>
        <div className="pchat-pick">
          {PETS.map((p) => (
            <button key={p} type="button" aria-pressed={p === pet} onClick={() => setPet(p)}>
              {PET_PERSONA[p].name}
            </button>
          ))}
        </div>
        <button type="button" className="pchat-x" aria-label="Đóng" onClick={() => setOpen(false)}>✕</button>
      </div>
      <div className="pchat-log" ref={logEl} aria-live="polite">
        <div className="pchat-msg is-pet">{HELLO[pet]}</div>
        {log.map((b) => (
          <div key={b.id} className={`pchat-msg ${b.error ? "err" : b.role === "user" ? "is-user" : "is-pet"}`}>{b.error ? b.text : plain(b.text)}</div>
        ))}
        {busy && <div className="pchat-msg is-pet">…</div>}
      </div>
      <form className="pchat-form" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input ref={inputEl} value={text} maxLength={CHAT_MAX_CHARS} onChange={(e) => setText(e.target.value)} placeholder={`Hỏi ${name} về tiếng Anh…`} aria-label="Tin nhắn" autoComplete="off" />
        <button type="submit" className="btn btn-sm" disabled={busy || !text.trim()}>Gửi</button>
      </form>
      <p className="pchat-note">Trợ lý AI có thể nhầm — hãy kiểm tra lại khi cần.</p>
    </section>
  );
}
