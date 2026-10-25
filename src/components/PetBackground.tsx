"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { BREAK_AFTER_MIN, breakReminder, greetingFor } from "@/core/pet-tips";
import { isPetsOn, petSay, SAY_EVENT, setPetsOn, subscribePets, type PetMessage } from "@/lib/pets";

/**
 * Hoạt ảnh nền: hai nhân vật chibi (Nuonuo, Phoebe) sống dọc đáy màn hình, dùng TOÀN BỘ hoạt ảnh
 * (public/pets/manifest.json). Mỗi bé tự chọn "kịch bản" (chuỗi hoạt ảnh) ngẫu nhiên; thỉnh thoảng
 * cả hai chạy lại gần nhau và cùng diễn một cảnh đôi (pair_*).
 * Nguồn hình: JiuNuoDesktopPet (xem public/pets/CREDITS.md) — dùng phi thương mại, có sự cho phép của tác giả.
 * Chỉ trang trí: aria-hidden, pointer-events: none, đi phía trên nội dung (không chặn bấm chuột).
 */

type Who = "nuonuo" | "phoebe";
const LOOP_MS = 16 * 83; // 16 khung × 83ms

/** Một bước: phát `anim` trong `loops` vòng (hoặc khoảng ms nếu có), di chuyển `speed` px/giây theo hướng đang quay. */
type Step = { anim: string; loops?: number; ms?: [number, number]; speed?: number };
type Script = { w: number; steps: Step[] };

const S = (anim: string, loops = 1, speed = 0): Step => ({ anim, loops, speed });
const T = (anim: string, a: number, b: number, speed = 0): Step => ({ anim, ms: [a, b], speed });

const COMMON: Script[] = [
  { w: 4, steps: [T("idle", 2000, 4500)] },
  { w: 6, steps: [T("walk", 3000, 7000, 38)] },
  { w: 1, steps: [T("run", 1500, 3000, 110)] },
  { w: 2, steps: [T("curious", 1800, 3200)] },
  { w: 2, steps: [T("sleep", 6000, 12000)] },
  { w: 2, steps: [S("jump"), S("fall"), S("land")] },
  { w: 2, steps: [S("hungry", 2), S("chomp", 2), S("lick"), S("satisfied")] },
  { w: 1, steps: [S("slide", 2, 60), S("land")] },
  { w: 1, steps: [S("roll", 2, 70)] },
  { w: 1, steps: [S("climb", 2)] },
  { w: 1, steps: [S("pinch", 2)] },
  { w: 1, steps: [S("drag"), S("toss"), S("fall"), S("land")] },
];

const SCRIPTS: Record<Who, Script[]> = {
  nuonuo: COMMON,
  phoebe: [
    ...COMMON,
    // Trò nghịch ngợm riêng của Phoebe
    { w: 1, steps: [S("pinch_right", 2)] },
    { w: 2, steps: [S("prank_sneak", 2, 45), S("charge", 1, 120), S("kick"), S("gloat")] },
    { w: 1, steps: [S("punch"), S("recoil"), S("gloat")] },
    { w: 2, steps: [S("hat_open"), S("hat_hold", 2), S("hat_throw"), S("hat_pickup"), S("hat_wear")] },
    { w: 1, steps: [S("hat_store"), S("hat_return"), S("hat_wear")] },
    { w: 1, steps: [S("bare_idle", 2), S("bare_run", 2, 110), S("bare_kick"), S("bare_tear"), S("bare_recover")] },
    { w: 1, steps: [S("bare_drag"), S("bare_fall"), S("bare_recover")] },
  ],
};

/** Cảnh đôi: hoạt ảnh (cả hai bé đều có) và số vòng. */
const PAIR_SCENES: Step[] = [
  S("pair_notice"), S("pair_nuzzle", 2), S("pair_cheek", 2), S("pair_ball", 3),
  S("pair_feed", 2), S("pair_sleep", 3),
];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
function pickScript(who: Who): Script {
  const list = SCRIPTS[who];
  let r = Math.random() * list.reduce((s, x) => s + x.w, 0);
  for (const s of list) {
    r -= s.w;
    if (r <= 0) return s;
  }
  return list[0];
}
const stepMs = (s: Step) => (s.ms ? rand(s.ms[0], s.ms[1]) : (s.loops ?? 1) * LOOP_MS);

type PetState = {
  who: Who;
  x: number;
  dir: 1 | -1;
  anim: string;
  steps: Step[];
  stepEnd: number;
  speed: number;
  /** điểm hẹn của cảnh đôi: đi tới đó rồi quay mặt và chờ bạn */
  goal: { x: number; face: 1 | -1 } | null;
  scene: Step | null; // cảnh đôi đang tham gia
  waiting: boolean; // đã tới điểm hẹn, chờ bạn
};

export function PetBackground() {
  const on = useSyncExternalStore(subscribePets, isPetsOn, () => false);
  const [size, setSize] = useState(104);
  const [anims, setAnims] = useState<Record<Who, string>>({ nuonuo: "idle", phoebe: "idle" });
  const els = useRef<Record<Who, HTMLDivElement | null>>({ nuonuo: null, phoebe: null });
  const bubbleEl = useRef<HTMLDivElement>(null);
  const [bubble, setBubble] = useState<{ text: string; who: Who; key: number } | null>(null);

  useEffect(() => {
    const upd = () => setSize(window.innerWidth < 720 ? 84 : 112);
    upd();
    window.addEventListener("resize", upd);
    return () => window.removeEventListener("resize", upd);
  }, []);

  // Trợ lý có sẵn: lời chào đầu phiên + nhắc nghỉ sau BREAK_AFTER_MIN phút học (chỉ tính lúc tab đang hiện).
  useEffect(() => {
    if (!on) return;
    const hello = window.setTimeout(() => {
      petSay({ id: "hello", once: true, text: greetingFor(new Date().getHours()), ttl: 8000 });
    }, 3500);
    let visibleSec = 0;
    const iv = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      visibleSec += 15;
      if (visibleSec >= BREAK_AFTER_MIN * 60) {
        visibleSec = 0;
        petSay({ text: breakReminder(BREAK_AFTER_MIN), ttl: 9000 });
      }
    }, 15000);
    return () => { window.clearTimeout(hello); window.clearInterval(iv); };
  }, [on]);

  useEffect(() => {
    if (!on) return;
    const maxX = () => Math.max(0, window.innerWidth - size);
    const mk = (who: Who, frac: number): PetState => ({
      who, x: maxX() * frac, dir: Math.random() < 0.5 ? 1 : -1, anim: "idle",
      steps: [T("idle", 800, 1500)], stepEnd: performance.now() + 1200, speed: 0, goal: null, scene: null, waiting: false,
    });
    const nu = mk("nuonuo", 0.2);
    const ph = mk("phoebe", 0.75);
    const pets = [nu, ph];
    const other = (p: PetState) => (p === nu ? ph : nu);
    let nextScene = performance.now() + rand(20000, 35000);
    let last = performance.now();
    let raf = 0;

    // Hàng đợi lời nhắn: nói lần lượt, mỗi lời một bong bóng nổi trên đầu bé đang nói.
    const queue: PetMessage[] = [];
    let speaking: { who: Who; until: number } | null = null;
    let nextSpeakAt = 0;
    let bubbleKey = 0;
    const onSay = (e: Event) => {
      const m = (e as CustomEvent<PetMessage>).detail;
      if (m && m.text) queue.push(m);
    };
    window.addEventListener(SAY_EVENT, onSay);

    const show = (p: PetState, a: string) => {
      if (p.anim === a) return;
      p.anim = a;
      setAnims((cur) => ({ ...cur, [p.who]: a }));
    };
    const startStep = (p: PetState, now: number) => {
      const st = p.steps[0];
      show(p, st.anim);
      p.speed = st.speed ?? 0;
      p.stepEnd = now + stepMs(st);
      if (p.speed > 0 && !p.scene && Math.random() < 0.35) p.dir = (p.dir * -1) as 1 | -1;
    };
    const nextStep = (p: PetState, now: number) => {
      p.steps = p.steps.slice(1);
      if (p.steps.length === 0) {
        p.scene = null;
        p.steps = [...pickScript(p.who).steps];
      }
      startStep(p, now);
    };
    const startScene = () => {
      const sc = PAIR_SCENES[Math.floor(Math.random() * PAIR_SCENES.length)];
      const gap = size * 0.75;
      const mid = rand(gap, Math.max(gap + 1, maxX() - gap));
      const [l, r] = nu.x <= ph.x ? [nu, ph] : [ph, nu];
      l.goal = { x: Math.max(0, mid - gap / 2), face: 1 };
      r.goal = { x: Math.min(maxX(), mid + gap / 2), face: -1 };
      for (const p of pets) {
        p.scene = sc;
        p.waiting = false;
        p.speed = 100;
        p.stepEnd = Infinity;
        show(p, "run");
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(now - last, 100) / 1000;
      last = now;

      if (speaking && now >= speaking.until) {
        speaking = null;
        setBubble(null);
        nextSpeakAt = now + 1200;
      }
      if (!speaking && queue.length && now >= nextSpeakAt) {
        const m = queue.shift()!;
        const who: Who = m.who ?? (Math.random() < 0.5 ? "nuonuo" : "phoebe");
        const ttl = m.ttl ?? 7000;
        speaking = { who, until: now + ttl };
        setBubble({ text: m.text, who, key: ++bubbleKey });
        const sp = who === "nuonuo" ? nu : ph;
        if (!sp.scene && !sp.goal) {
          sp.steps = [T("curious", ttl, ttl)]; // dừng lại, quay sang "nói chuyện"
          startStep(sp, now);
        }
      }
      if (!nu.scene && !ph.scene && now >= nextScene) startScene();

      for (const p of pets) {
        if (p.goal) {
          const dx = p.goal.x - p.x;
          if (Math.abs(dx) <= 3) {
            p.x = p.goal.x;
            p.dir = p.goal.face;
            p.goal = null;
            p.waiting = true;
            p.speed = 0;
            show(p, "idle");
          } else {
            p.dir = dx > 0 ? 1 : -1;
            p.x += p.dir * 100 * dt;
          }
        } else if (p.waiting) {
          // bắt đầu diễn khi bạn kia cũng đã tới nơi
          if (other(p).waiting) {
            for (const q of pets) {
              q.waiting = false;
              q.steps = [q.scene!];
              startStep(q, now);
            }
          }
        } else {
          if (now >= p.stepEnd) nextStep(p, now);
          if (p.speed > 0) {
            p.x += p.dir * p.speed * dt;
            if (p.x <= 0) { p.x = 0; p.dir = 1; }
            else if (p.x >= maxX()) { p.x = maxX(); p.dir = -1; }
          }
        }
        const el = els.current[p.who];
        if (el) el.style.transform = `translate3d(${p.x.toFixed(1)}px,0,0) scaleX(${p.dir})`;
        if (speaking && speaking.who === p.who && bubbleEl.current) {
          // bong bóng rộng 200px bám theo bé, kẹp trong màn hình; đuôi trỏ đúng đầu bé
          const bw = 200;
          const cx = p.x + size / 2;
          const bx = Math.min(Math.max(cx - bw / 2, 8), Math.max(8, window.innerWidth - bw - 8));
          bubbleEl.current.style.transform = `translate3d(${bx.toFixed(1)}px,0,0)`;
          bubbleEl.current.style.setProperty("--tail", `${Math.min(Math.max(cx - bx, 16), bw - 16).toFixed(0)}px`);
        }
      }
      if (!nu.scene && !ph.scene && nextScene < now) nextScene = now + rand(25000, 45000);
      raf = requestAnimationFrame(tick);
    };

    for (const p of pets) show(p, "idle");
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener(SAY_EVENT, onSay);
      setBubble(null);
    };
  }, [on, size]);

  if (!on) return null;
  return (
    <>
    {bubble && (
      <div className="pet-bubble-layer" style={{ "--pet-size": `${size}px` } as CSSProperties}>
        <div key={bubble.key} ref={bubbleEl} className="pet-bubble" role="status" aria-live="polite" onClick={() => setBubble(null)}>
          {bubble.text}
        </div>
      </div>
    )}
    <div className="pet-layer" aria-hidden="true">
      {(["nuonuo", "phoebe"] as const).map((who) => (
        <div key={who} ref={(e) => { els.current[who] = e; }} className="pet" style={{ width: size, height: size }}>
          {/* dùng <img> thường: WebP động qua next/image sẽ mất hoạt ảnh */}
          <img src={`/pets/${who}/${anims[who]}.webp`} alt="" width={size} height={size} draggable={false} decoding="async" />
        </div>
      ))}
    </div>
    </>
  );
}

/** Nút nhỏ trên thanh trên cùng: bật/tắt thú cưng nền. */
export function PetButton() {
  const on = useSyncExternalStore(subscribePets, isPetsOn, () => false);
  const label = on ? "Tắt thú cưng trợ lý" : "Bật thú cưng trợ lý";
  return (
    <button type="button" className="mute" aria-pressed={on} aria-label={label} title={label} onClick={() => setPetsOn(!on)}>
      {on ? "🐾" : "🚫"}
    </button>
  );
}
