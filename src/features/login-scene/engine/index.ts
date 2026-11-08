import type { DrawState, SceneCanvas, SceneDraw } from "../scenes/types";
import { HANDLE_DIST, MOVE_STEP, ROTATE_STEP, approach, clamp, coneLightsRect, hexA, type Cone } from "./geometry";

export type EngineOptions = {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  stage: HTMLElement;
  /** Nút DOM đặt đè lên công cụ: nhận con trỏ, focus và phím mũi tên (canvas không nhận sự kiện). */
  toolBtn: HTMLElement;
  /** Chấm tròn xoay (chỉ cho con trỏ; bàn phím xoay bằng Shift + mũi tên trên nút công cụ). */
  handleBtn: HTMLElement;
  draw: SceneDraw;
  cfg: SceneCanvas;
  pal: DrawState["pal"];
  /** Ô mật khẩu cần soi sáng. */
  getTarget: () => HTMLElement | null;
  onLit: (lit: boolean) => void;
};

export type Engine = { destroy(): void };

const TOOL_BOX = 56; // vùng bấm của công cụ (≥ 44px)
const HANDLE_BOX = 44;
const SPREAD = 0.5; // ~29°
const BEAM_LEN = 560;
const EDGE = 30; // lề giữ công cụ/nhân vật bên trong sân khấu

/**
 * Engine dùng chung: vòng lặp vẽ, nhân vật đi theo con trỏ, kéo công cụ, xoay chùm sáng, báo "đang chiếu vào ô mật khẩu".
 * Scene chỉ khai báo cách vẽ. Dừng khi tab ẩn và khi không còn gì chuyển động; DPR tối đa 2.
 */
export function startEngine(o: EngineOptions): Engine | null {
  const ctx = o.canvas.getContext("2d");
  if (!ctx) return null;

  let dpr = 1;
  let w = 0;
  let h = 0;
  let stage = { x: 0, y: 0, w: 0, h: 0 };
  let ready = false;
  let rootRect = { left: 0, top: 0 };

  const m = { x: 0, y: 0, facing: 1 as 1 | -1, moving: false, blink: false, blinkAt: 2, blinkEnd: 0 };
  const ptr = { x: 0, y: 0, has: false };
  const tool = { x: 0, y: 0, angle: -Math.PI / 2, held: false };
  let rotating = false;
  let lit = false;

  const s: DrawState = {
    t: 0, dt: 0, w: 0, h: 0, stage,
    mascot: { x: 0, y: 0, facing: 1, moving: false, blink: false, excited: false, look: { x: 0, y: 0 } },
    tool, lit: false, pal: o.pal,
  };

  let raf = 0;
  let running = false;
  let last = 0;
  let destroyed = false;
  let needs = true;
  let tick = 0;

  const mascotY = (): number => (o.cfg.mascot === "walk" ? stage.y + stage.h - 16 : stage.y + Math.min(84, stage.h * 0.42) + Math.sin(s.t * 1.6) * 3);
  const clampTool = (): void => {
    tool.x = clamp(tool.x, stage.x + EDGE, stage.x + stage.w - EDGE);
    tool.y = clamp(tool.y, stage.y + EDGE, stage.y + stage.h - EDGE);
  };

  function measure(): void {
    const r = o.root.getBoundingClientRect();
    const sr = o.stage.getBoundingClientRect();
    rootRect = { left: r.left, top: r.top };
    w = r.width;
    h = r.height;
    stage = { x: sr.left - r.left, y: sr.top - r.top, w: sr.width, h: sr.height };
    s.stage = stage;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    o.canvas.width = Math.round(w * dpr);
    o.canvas.height = Math.round(h * dpr);
    if (!ready) {
      ready = true;
      const strip = stage.h < 200;
      tool.x = stage.x + stage.w * 0.75;
      tool.y = stage.y + stage.h * (strip ? 0.5 : 0.78);
      m.x = stage.x + stage.w * 0.3;
    }
    clampTool();
    m.x = clamp(m.x, stage.x + EDGE, stage.x + stage.w - EDGE);
    wake();
  }

  const targetX = (): number => (ptr.has ? clamp(ptr.x, stage.x + EDGE, stage.x + stage.w - EDGE) : m.x);

  function update(dt: number): void {
    const before = m.x;
    m.x = approach(m.x, targetX(), (o.cfg.mascot === "walk" ? 150 : 220) * dt);
    m.moving = Math.abs(m.x - before) > 0.01;
    if (m.moving) m.facing = m.x > before ? 1 : -1;
    m.y = mascotY();
    if (s.t >= m.blinkAt) {
      m.blinkEnd = s.t + 0.14;
      m.blinkAt = s.t + 2 + Math.random() * 3;
    }
    m.blink = s.t < m.blinkEnd;
  }

  const cone = (): Cone => ({ x: tool.x + Math.cos(tool.angle) * 18, y: tool.y + Math.sin(tool.angle) * 18, angle: tool.angle, spread: SPREAD, length: BEAM_LEN });

  function checkLit(): void {
    const el = o.getTarget();
    let now = false;
    if (el) {
      const r = el.getBoundingClientRect();
      now = coneLightsRect(cone(), { left: r.left - rootRect.left, top: r.top - rootRect.top, width: r.width, height: r.height });
    }
    if (now !== lit) {
      lit = now;
      o.onLit(lit);
    }
  }

  function render(): void {
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, w, h);
    s.w = w;
    s.h = h;
    s.lit = lit;
    Object.assign(s.mascot, { x: m.x, y: m.y, facing: m.facing, moving: m.moving, blink: m.blink, excited: lit });
    s.mascot.look.x = ptr.has ? ptr.x : m.x + m.facing * 80;
    s.mascot.look.y = ptr.has ? ptr.y : m.y;

    o.draw.drawDecor(ctx!, s);

    // chùm sáng: hình quạt phai dần về cuối
    const c = cone();
    const g = ctx!.createRadialGradient(c.x, c.y, 4, c.x, c.y, c.length);
    g.addColorStop(0, hexA(o.pal.glow, lit ? 0.62 : 0.46));
    g.addColorStop(1, hexA(o.pal.glow, 0));
    ctx!.fillStyle = g;
    ctx!.beginPath();
    ctx!.moveTo(c.x, c.y);
    ctx!.arc(c.x, c.y, c.length, c.angle - c.spread / 2, c.angle + c.spread / 2);
    ctx!.closePath();
    ctx!.fill();

    o.draw.drawMascot(ctx!, s);

    // chấm tròn xoay
    const hx = tool.x + Math.cos(tool.angle) * HANDLE_DIST;
    const hy = tool.y + Math.sin(tool.angle) * HANDLE_DIST;
    ctx!.strokeStyle = hexA(o.pal.text, 0.35);
    ctx!.lineWidth = 1.5;
    ctx!.setLineDash([3, 4]);
    ctx!.beginPath();
    ctx!.arc(tool.x, tool.y, HANDLE_DIST, 0, Math.PI * 2);
    ctx!.stroke();
    ctx!.setLineDash([]);
    ctx!.fillStyle = o.pal.glow;
    ctx!.strokeStyle = o.pal.accent;
    ctx!.lineWidth = 2.5;
    ctx!.beginPath();
    ctx!.arc(hx, hy, 8, 0, Math.PI * 2);
    ctx!.fill();
    ctx!.stroke();

    o.draw.drawTool(ctx!, s);

    o.toolBtn.style.transform = `translate(${tool.x - TOOL_BOX / 2}px,${tool.y - TOOL_BOX / 2}px)`;
    o.handleBtn.style.transform = `translate(${hx - HANDLE_BOX / 2}px,${hy - HANDLE_BOX / 2}px)`;
  }

  function frame(now: number): void {
    if (destroyed) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    s.t += dt;
    s.dt = dt;
    const moving = tool.held || rotating || Math.abs(m.x - targetX()) > 0.5;
    // Chỉ có hoạt cảnh nền (tuyết, dơi) thì vẽ 30 khung/giây cho đỡ tốn pin.
    if (!moving && !needs && o.cfg.ambient && (tick++ & 1) === 1) {
      raf = requestAnimationFrame(frame);
      return;
    }
    update(dt);
    checkLit();
    render();
    if (!moving && !needs && !o.cfg.ambient) {
      running = false;
      return;
    }
    needs = false;
    raf = requestAnimationFrame(frame);
  }

  function wake(): void {
    needs = true;
    if (running || destroyed || document.hidden || !ready) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  const rel = (e: PointerEvent) => ({ x: e.clientX - rootRect.left, y: e.clientY - rootRect.top });

  const onWindowMove = (e: PointerEvent): void => {
    if (e.pointerType === "touch") return;
    const p = rel(e);
    if (p.x < 0 || p.y < 0 || p.x > w || p.y > h) return;
    ptr.x = p.x;
    ptr.y = p.y;
    ptr.has = true;
    wake();
  };
  // Chạm (điện thoại): chạm vào khoảng trống của sân khấu để gọi nhân vật; không chặn cuộn trang.
  const onStageDown = (e: PointerEvent): void => {
    const p = rel(e);
    ptr.x = p.x;
    ptr.y = p.y;
    ptr.has = true;
    wake();
  };

  let grab = { dx: 0, dy: 0 };
  const onToolDown = (e: PointerEvent): void => {
    o.toolBtn.setPointerCapture(e.pointerId);
    tool.held = true;
    const p = rel(e);
    grab = { dx: tool.x - p.x, dy: tool.y - p.y };
    wake();
  };
  const onToolMove = (e: PointerEvent): void => {
    if (!tool.held) return;
    const p = rel(e);
    tool.x = p.x + grab.dx;
    tool.y = p.y + grab.dy;
    clampTool();
    wake();
  };
  const onToolUp = (e: PointerEvent): void => {
    tool.held = false;
    if (o.toolBtn.hasPointerCapture(e.pointerId)) o.toolBtn.releasePointerCapture(e.pointerId);
    wake();
  };
  const onToolKey = (e: KeyboardEvent): void => {
    const k = e.key;
    if (!k.startsWith("Arrow")) return;
    e.preventDefault();
    if (e.shiftKey) {
      if (k === "ArrowLeft") tool.angle -= ROTATE_STEP;
      else if (k === "ArrowRight") tool.angle += ROTATE_STEP;
    } else {
      const step = MOVE_STEP;
      if (k === "ArrowLeft") tool.x -= step;
      else if (k === "ArrowRight") tool.x += step;
      else if (k === "ArrowUp") tool.y -= step;
      else if (k === "ArrowDown") tool.y += step;
      clampTool();
    }
    wake();
  };

  const onHandleDown = (e: PointerEvent): void => {
    o.handleBtn.setPointerCapture(e.pointerId);
    rotating = true;
    wake();
  };
  const onHandleMove = (e: PointerEvent): void => {
    if (!rotating) return;
    const p = rel(e);
    tool.angle = Math.atan2(p.y - tool.y, p.x - tool.x);
    wake();
  };
  const onHandleUp = (e: PointerEvent): void => {
    rotating = false;
    if (o.handleBtn.hasPointerCapture(e.pointerId)) o.handleBtn.releasePointerCapture(e.pointerId);
    wake();
  };

  const onVisibility = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      running = false;
    } else wake();
  };

  window.addEventListener("pointermove", onWindowMove, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  o.stage.addEventListener("pointerdown", onStageDown, { passive: true });
  o.toolBtn.addEventListener("pointerdown", onToolDown);
  o.toolBtn.addEventListener("pointermove", onToolMove);
  o.toolBtn.addEventListener("pointerup", onToolUp);
  o.toolBtn.addEventListener("pointercancel", onToolUp);
  o.toolBtn.addEventListener("keydown", onToolKey);
  o.handleBtn.addEventListener("pointerdown", onHandleDown);
  o.handleBtn.addEventListener("pointermove", onHandleMove);
  o.handleBtn.addEventListener("pointerup", onHandleUp);
  o.handleBtn.addEventListener("pointercancel", onHandleUp);
  const ro = new ResizeObserver(measure);
  ro.observe(o.root);
  measure();

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onWindowMove);
      document.removeEventListener("visibilitychange", onVisibility);
      o.stage.removeEventListener("pointerdown", onStageDown);
      o.toolBtn.removeEventListener("pointerdown", onToolDown);
      o.toolBtn.removeEventListener("pointermove", onToolMove);
      o.toolBtn.removeEventListener("pointerup", onToolUp);
      o.toolBtn.removeEventListener("pointercancel", onToolUp);
      o.toolBtn.removeEventListener("keydown", onToolKey);
      o.handleBtn.removeEventListener("pointerdown", onHandleDown);
      o.handleBtn.removeEventListener("pointermove", onHandleMove);
      o.handleBtn.removeEventListener("pointerup", onHandleUp);
      o.handleBtn.removeEventListener("pointercancel", onHandleUp);
      if (lit) o.onLit(false);
      ctx.clearRect(0, 0, o.canvas.width, o.canvas.height);
    },
  };
}
