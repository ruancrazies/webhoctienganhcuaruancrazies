"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { DEFAULT_THEME_ID } from "@/cosmetics/core/constants";
import type { ThemeOption } from "@/cosmetics/registry";
import { getAuto, getThemeId, setAuto, setTheme, subscribeTheme } from "@/lib/theme";

export function useThemeId(): string {
  return useSyncExternalStore(subscribeTheme, getThemeId, () => DEFAULT_THEME_ID);
}
export function useThemeAuto(): boolean {
  return useSyncExternalStore(subscribeTheme, getAuto, () => false);
}

/** Chọn theme: nếu CSS của theme chưa có trong trang (theme mới thêm) thì để server render lại với CSS đó. */
export function useChooseTheme(): (id: string) => void {
  const router = useRouter();
  return (id) => {
    if (!setTheme(id)) router.refresh();
  };
}

/** Công tắt "Tự động theo thiết bị": bật thì tối khi hệ điều hành ở chế độ tối, còn lại Vở ô ly. Dùng chung cho hồ sơ và menu nhanh. */
export function AutoThemeSwitch() {
  const auto = useThemeAuto();
  return (
    <button type="button" className="btn btn-light btn-sm" aria-pressed={auto} onClick={() => setAuto(!auto)}>
      {auto ? "Đang bật" : "Đang tắt"}
    </button>
  );
}

/** Bộ chọn đầy đủ cho trang hồ sơ (giai đoạn 2 chuyển sang Bộ sưu tập). Mỗi theme là một nút; chọn theme thì tắt chế độ tự động. */
export function ThemePicker({ options }: { options: ThemeOption[] }) {
  const id = useThemeId();
  const auto = useThemeAuto();
  const choose = useChooseTheme();
  return (
    <div className="set-block">
      <div>
        <b>Giao diện</b>
        <p className="muted">Chọn một giao diện, hoặc để thiết bị quyết định.</p>
      </div>
      <div className="scope" role="group" aria-label="Giao diện">
        {options.map((o) => (
          <button key={o.id} type="button" className="pill" aria-pressed={!auto && id === o.id} onClick={() => choose(o.id)}>
            {o.name}
          </button>
        ))}
      </div>
      <div className="toggle">
        <div>
          <b>Tự động theo thiết bị</b>
          <p className="muted">Tối khi thiết bị ở chế độ tối, còn lại Vở ô ly.</p>
        </div>
        <AutoThemeSwitch />
      </div>
    </div>
  );
}
