"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { ThemeOption } from "@/cosmetics/registry";
import { getRecentSnapshot, subscribeTheme } from "@/lib/theme";
import { isPetsOn, setPetsOn, subscribePets } from "@/lib/pets";
import { isMuted, setMuted, subscribeMuted } from "@/lib/sound";
import { Icon } from "./Icon";
import { AutoThemeSwitch, useChooseTheme, useThemeAuto, useThemeId } from "./ThemeToggle";

/**
 * Menu nhanh (⋯) trên thanh trên: Giao diện (ba theme gần nhất), Âm thanh, Thú cưng.
 * Là một "disclosure" thường (nút + vùng nội dung), không phải role=menu: các điều khiển bên trong là nút bấm bình thường,
 * Tab đi qua được. Esc đóng và trả focus về nút mở; bấm ra ngoài cũng đóng.
 */
export function QuickMenu({ themes }: { themes: ThemeOption[] }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const themeId = useThemeId();
  const auto = useThemeAuto();
  const choose = useChooseTheme();
  const recent = useSyncExternalStore(subscribeTheme, getRecentSnapshot, () => "");
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  const pets = useSyncExternalStore(subscribePets, isPetsOn, () => false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  // Ba theme gần nhất; chưa đủ thì bù theo thứ tự registry.
  const byId = new Map(themes.map((t) => [t.id, t]));
  const quick: ThemeOption[] = [];
  for (const id of [...recent.split(",").filter(Boolean), ...themes.map((t) => t.id)]) {
    const t = byId.get(id);
    if (t && !quick.includes(t) && quick.length < 3) quick.push(t);
  }

  return (
    <div className="qmenu" ref={box}>
      <button ref={btn} type="button" className="mute" aria-label="Menu nhanh" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        <Icon name="more" />
      </button>
      {open ? (
        <div id={panelId} className="qmenu-panel" role="group" aria-label="Menu nhanh">
          <div className="qmenu-sec">
            <b>Giao diện</b>
            <div className="scope" role="group" aria-label="Giao diện">
              {quick.map((t) => (
                <button key={t.id} type="button" className="pill" aria-pressed={!auto && themeId === t.id} onClick={() => choose(t.id)}>
                  {t.name}
                </button>
              ))}
            </div>
            <Link href="/profile/collection?tab=theme" className="small" onClick={() => setOpen(false)}>Xem tất cả giao diện</Link>
            <div className="toggle">
              <span className="small">Tự động theo thiết bị</span>
              <AutoThemeSwitch />
            </div>
          </div>
          <div className="qmenu-sec toggle">
            <span className="row"><Icon name={muted ? "volume-off" : "volume"} /> Âm thanh</span>
            <button type="button" className="btn btn-light btn-sm" aria-pressed={!muted} onClick={() => setMuted(!muted)}>
              {muted ? "Đang tắt" : "Đang bật"}
            </button>
          </div>
          <div className="qmenu-sec toggle">
            <span className="row"><Icon name="paw" /> Thú cưng</span>
            <button type="button" className="btn btn-light btn-sm" aria-pressed={pets} onClick={() => setPetsOn(!pets)}>
              {pets ? "Đang bật" : "Đang tắt"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
