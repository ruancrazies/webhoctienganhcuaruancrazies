"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isPetsOn, setPetsOn, subscribePets } from "@/lib/pets";

/**
 * Hoạt ảnh nền: hai nhân vật chibi (Nuonuo, Phoebe) đi lại dọc đáy màn hình.
 * Nguồn hình: dự án JiuNuoDesktopPet (xem public/pets/CREDITS.md) — dùng phi thương mại, có sự cho phép của tác giả.
 * Chỉ trang trí: aria-hidden, pointer-events: none, nằm sau nội dung, tạm dừng khi tab bị ẩn (rAF).
 */

type Anim = "idle" | "walk" | "run" | "sleep" | "curious" | "jump";
type Who = "nuonuo" | "phoebe";

/** Trọng số chọn hành vi kế tiếp + thời lượng (ms) + tốc độ (px/giây). */
const BEHAVIORS: { anim: Anim; weight: number; ms: [number, number]; speed: number }[] = [
  { anim: "idle", weight: 3, ms: [2000, 4500], speed: 0 },
  { anim: "walk", weight: 5, ms: [3000, 7000], speed: 38 },
  { anim: "run", weight: 1, ms: [1500, 3000], speed: 110 },
  { anim: "curious", weight: 2, ms: [1800, 3200], speed: 0 },
  { anim: "jump", weight: 1, ms: [1200, 1600], speed: 0 },
  { anim: "sleep", weight: 2, ms: [6000, 12000], speed: 0 },
];

function pick() {
  const total = BEHAVIORS.reduce((s, b) => s + b.weight, 0);
  let r = Math.random() * total;
  for (const b of BEHAVIORS) {
    r -= b.weight;
    if (r <= 0) return b;
  }
  return BEHAVIORS[0];
}
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function Pet({ who, startFrac, size }: { who: Who; startFrac: number; size: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [anim, setAnim] = useState<Anim>("idle");

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let x = Math.max(0, (window.innerWidth - size) * startFrac);
    let dir = Math.random() < 0.5 ? 1 : -1;
    let cur = BEHAVIORS[0];
    let until = performance.now() + 1200;
    let last = performance.now();
    let raf = 0;

    const apply = () => {
      el.style.transform = `translate3d(${x.toFixed(1)}px,0,0) scaleX(${dir})`;
    };
    apply();

    const tick = (now: number) => {
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      if (now >= until) {
        cur = pick();
        until = now + rand(cur.ms[0], cur.ms[1]);
        if (cur.speed > 0 && Math.random() < 0.35) dir = (dir * -1) as 1 | -1;
        setAnim(cur.anim);
      }
      if (cur.speed > 0) {
        const max = Math.max(0, window.innerWidth - size);
        x += dir * cur.speed * dt;
        if (x <= 0) { x = 0; dir = 1; }
        else if (x >= max) { x = max; dir = -1; }
        apply();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [size, startFrac]);

  return (
    <div ref={box} className="pet" style={{ width: size, height: size }}>
      {/* dùng <img> thường: WebP động qua next/image sẽ mất hoạt ảnh */}
      <img src={`/pets/${who}/${anim}.webp`} alt="" width={size} height={size} draggable={false} decoding="async" />
    </div>
  );
}

export function PetBackground() {
  const on = useSyncExternalStore(subscribePets, isPetsOn, () => false);
  const [size, setSize] = useState(104);

  useEffect(() => {
    const upd = () => setSize(window.innerWidth < 720 ? 84 : 112);
    upd();
    window.addEventListener("resize", upd);
    return () => window.removeEventListener("resize", upd);
  }, []);

  if (!on) return null;
  return (
    <div className="pet-layer" aria-hidden="true">
      <Pet who="nuonuo" startFrac={0.2} size={size} />
      <Pet who="phoebe" startFrac={0.75} size={size} />
    </div>
  );
}

/** Nút nhỏ trên thanh trên cùng: bật/tắt thú cưng nền. */
export function PetButton() {
  const on = useSyncExternalStore(subscribePets, isPetsOn, () => false);
  const label = on ? "Tắt thú cưng nền" : "Bật thú cưng nền";
  return (
    <button type="button" className="mute" aria-pressed={on} aria-label={label} title={label} onClick={() => setPetsOn(!on)}>
      {on ? "🐾" : "🚫"}
    </button>
  );
}
