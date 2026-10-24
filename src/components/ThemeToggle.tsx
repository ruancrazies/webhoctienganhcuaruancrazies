"use client";

import { useSyncExternalStore } from "react";
import { getThemePref, resolveTheme, setThemePref, subscribeTheme, type ResolvedTheme, type ThemePref } from "@/lib/theme";

function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribeTheme, getThemePref, () => "system");
}

function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeTheme, () => resolveTheme(getThemePref()), () => "light");
}

/** Nút nhỏ trên thanh trên cùng: đổi nhanh sáng ↔ tối. */
export function ThemeButton() {
  const theme = useResolvedTheme();
  const next = theme === "dark" ? "light" : "dark";
  const label = next === "dark" ? "Chuyển sang giao diện tối" : "Chuyển sang giao diện sáng";
  return (
    <button type="button" className="mute" aria-label={label} title={label} onClick={() => setThemePref(next)}>
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}

const OPTIONS: { value: ThemePref; label: string; icon: string }[] = [
  { value: "system", label: "Tự động", icon: "🖥️" },
  { value: "light", label: "Sáng", icon: "☀️" },
  { value: "dark", label: "Tối", icon: "🌙" },
];

/** Bộ chọn đầy đủ cho trang hồ sơ. */
export function ThemePicker() {
  const pref = useThemePref();
  return (
    <div className="set-block">
      <div>
        <b>Giao diện</b>
        <p className="muted">“Tự động” theo cài đặt sáng/tối của thiết bị.</p>
      </div>
      <div className="scope" role="group" aria-label="Giao diện">
        {OPTIONS.map((o) => (
          <button key={o.value} type="button" className="pill" aria-pressed={pref === o.value} onClick={() => setThemePref(o.value)}>
            <span aria-hidden="true">{o.icon}</span> {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
