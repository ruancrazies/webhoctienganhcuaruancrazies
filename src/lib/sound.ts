/**
 * speak(): giọng đọc của trình duyệt. sfx(): âm hiệu ứng tạo bằng Web Audio (không có file).
 * Tùy chọn tắt âm lưu ở localStorage (chỉ là tùy chọn giao diện, không phải tiến độ).
 */
const KEY = "eg-muted";
const EVENT = "eg-muted-change";

export function isMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(KEY, muted ? "1" : "0");
  } catch {
    /* bỏ qua */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
  if (muted && typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

export function subscribeMuted(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Đọc to một từ/câu tiếng Anh. `force` = bỏ qua tắt âm (khi người dùng chủ động bấm nút nghe). */
export function speak(text: string, opts: { force?: boolean; rate?: number } = {}): void {
  if (typeof speechSynthesis === "undefined" || !text.trim()) return;
  if (!opts.force && isMuted()) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = opts.rate ?? 0.9;
    const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("en-us")) ?? speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("en"));
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  } catch {
    /* trình duyệt không hỗ trợ */
  }
}

export type Sfx = "tap" | "correct" | "wrong" | "done" | "levelup";

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.12) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(vol, c.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.02);
}

export function sfx(kind: Sfx): void {
  if (isMuted()) return;
  const c = audio();
  if (!c) return;
  switch (kind) {
    case "tap":
      tone(c, 520, 0, 0.06, "triangle", 0.08);
      break;
    case "correct":
      tone(c, 660, 0, 0.12);
      tone(c, 880, 0.09, 0.18);
      break;
    case "wrong":
      tone(c, 220, 0, 0.2, "sawtooth", 0.07);
      tone(c, 170, 0.12, 0.25, "sawtooth", 0.07);
      break;
    case "done":
      [523, 659, 784].forEach((f, i) => tone(c, f, i * 0.1, 0.2));
      break;
    case "levelup":
      [523, 659, 784, 1047].forEach((f, i) => tone(c, f, i * 0.12, 0.28));
      break;
  }
}
