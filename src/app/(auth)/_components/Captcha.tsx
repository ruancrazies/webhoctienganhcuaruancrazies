"use client";

import { useEffect, useRef } from "react";

/** Khóa công khai của Cloudflare Turnstile. Không đặt → không hiện CAPTCHA (khớp với server: không có secret thì không kiểm tra). */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error("Không tải được CAPTCHA")); };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Đặt trong <form>: Turnstile tự thêm input ẩn "cf-turnstile-response" vào form.
 * Token chỉ dùng được MỘT lần, nên truyền `resetSignal` (ví dụ state của useActionState) để làm mới widget sau mỗi lần gửi.
 */
export function Captcha({ resetSignal }: { resetSignal?: unknown }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (!SITE_KEY || !box.current) return;
    const el = box.current;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widget.current = window.turnstile.render(el, { sitekey: SITE_KEY, language: "vi", theme: "auto" });
      })
      .catch(() => { /* server sẽ từ chối khi thiếu token; người dùng bấm tải lại trang */ });
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, []);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
  }, [resetSignal]);

  if (!SITE_KEY) return null;
  return <div ref={box} className="captcha" />;
}
