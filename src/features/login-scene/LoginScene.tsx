"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SceneLitContext } from "./LitContext";
import { DRAW_LOADERS } from "./scenes/draw-loaders.generated";
import type { SceneCanvas, SceneDraw } from "./scenes/types";
import type { startEngine } from "./engine";

export type LoginSceneProps = {
  id: string;
  greeting: string;
  tagline: string;
  /** Có phần canvas (scene có `canvas` và admin chưa tắt). Không có = chỉ bản tĩnh. */
  canvas?: SceneCanvas;
  /** Màu cho canvas (sao chép từ token của scene, đã kiểm tương phản). */
  pal: { glow: string; accent: string; text: string; bg: string; bg2: string };
  /** Dùng trong xem trước của admin: giữ nguyên bố cục nhưng ép chiều cao cố định. */
  preview?: boolean;
  children: ReactNode;
};

type Loaded = { start: typeof startEngine; draw: SceneDraw };

const reducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const saveData = (): boolean => !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;

/**
 * Khung đăng nhập: sân khấu minh họa + thẻ đăng nhập (children). Toàn bộ chữ, màu và hình tĩnh nằm sẵn trong HTML từ server.
 * Canvas là phần NÂNG CAO, nạp sau khi trang rảnh; không nạp khi người dùng bật giảm chuyển động hoặc tiết kiệm dữ liệu,
 * hoặc khi canvas/draw.ts lỗi: lúc đó bản tĩnh của chính scene này vẫn nguyên (không về scene mặc định).
 */
export function LoginScene({ id, greeting, tagline, canvas, pal, preview, children }: LoginSceneProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const toolRef = useRef<HTMLButtonElement>(null);
  const handleRef = useRef<HTMLSpanElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [lit, setLit] = useState(false);

  // 1) Nạp engine + draw.ts khi trang rảnh.
  useEffect(() => {
    if (!canvas || reducedMotion() || saveData()) return;
    const loader = DRAW_LOADERS[id];
    if (!loader) return;
    let cancelled = false;
    const go = () => {
      Promise.all([import("./engine"), loader()])
        .then(([e, d]) => {
          if (!cancelled) setLoaded({ start: e.startEngine, draw: d.default });
        })
        .catch((err) => console.warn("[login-scene] không nạp được hiệu ứng, giữ bản tĩnh", err));
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
    const idle = typeof w.requestIdleCallback === "function";
    const h = idle ? w.requestIdleCallback!(go, { timeout: 1500 }) : window.setTimeout(go, 200);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => mq.matches && setLoaded(null); // bật giảm chuyển động giữa chừng: bỏ ngay
    mq.addEventListener("change", onChange);
    return () => {
      cancelled = true;
      mq.removeEventListener("change", onChange);
      if (idle) w.cancelIdleCallback?.(h);
      else window.clearTimeout(h);
    };
  }, [id, canvas]);

  // 2) Có module rồi và các nút công cụ đã vào DOM thì mới chạy engine.
  useEffect(() => {
    if (!loaded || !canvas) return;
    const root = rootRef.current, stage = stageRef.current, cv = canvasRef.current, tool = toolRef.current, handle = handleRef.current;
    if (!root || !stage || !cv || !tool || !handle) return;
    let engine: ReturnType<typeof startEngine> = null;
    try {
      engine = loaded.start({
        root, canvas: cv, stage, toolBtn: tool, handleBtn: handle, draw: loaded.draw, cfg: canvas, pal,
        getTarget: () => root.querySelector<HTMLElement>('[data-scene-target="password"]'),
        onLit: setLit,
      });
    } catch (err) {
      console.warn("[login-scene] engine lỗi, giữ bản tĩnh", err);
    }
    if (!engine) {
      setLoaded(null);
      return;
    }
    return () => {
      engine.destroy();
      setLit(false);
    };
  }, [loaded, canvas, pal]);

  const live = !!loaded && !!canvas;
  return (
    <div className="ls-frame" data-login-scene={id}>
      <div ref={rootRef} className={`ls-root${preview ? " ls-preview" : ""}`} data-live={live || undefined} data-lit={lit || undefined}>
        <div ref={stageRef} className="ls-stage">
          <div className="ls-art" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div>
          <div className="ls-copy">
            <p className="ls-greeting">{greeting}</p>
            <p className="ls-tagline">{tagline}</p>
            {live ? <p className="ls-hint">{canvas!.hint}</p> : null}
          </div>
        </div>
        {canvas ? <canvas ref={canvasRef} className="ls-canvas" aria-hidden="true" /> : null}
        {live ? (
          <>
            <button ref={toolRef} type="button" className="ls-tool" style={{ transform: "translate(-200px,-200px)" }}
              aria-label={`${canvas!.toolLabel}. Kéo để di chuyển, hoặc dùng phím mũi tên. Giữ Shift và bấm mũi tên trái phải để xoay. Chiếu vào ô mật khẩu để hiện mật khẩu.`} />
            <span ref={handleRef} className="ls-handle" aria-hidden="true" style={{ transform: "translate(-200px,-200px)" }} />
          </>
        ) : null}
        <div className="ls-side">
          <SceneLitContext.Provider value={lit}>{children}</SceneLitContext.Provider>
        </div>
      </div>
    </div>
  );
}
