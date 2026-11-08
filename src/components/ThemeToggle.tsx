"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { DEFAULT_THEME_ID } from "@/cosmetics/core/constants";
import { equipCosmeticAction } from "@/app/(app)/profile/actions";
import { applyServerTheme, getAuto, getCookieTheme, getThemeId, setAuto, setTheme, subscribeTheme } from "@/lib/theme";

export function useThemeId(): string {
  return useSyncExternalStore(subscribeTheme, getThemeId, () => DEFAULT_THEME_ID);
}
export function useThemeAuto(): boolean {
  return useSyncExternalStore(subscribeTheme, getAuto, () => false);
}

/**
 * Đổi giao diện: áp ngay trên thiết bị (không chờ mạng, không nháy), rồi nhờ server kiểm quyền và ghi vào TÀI KHOẢN
 * (theme theo người dùng, sang thiết bị khác vẫn giữ). Server từ chối (món chưa có/đã hết hạn) → trả về lựa chọn trước đó.
 */
function usePersistTheme(): (value: string, previous: string) => void {
  const router = useRouter();
  return (value, previous) => {
    equipCosmeticAction({ kind: "theme", id: value })
      .then((r) => {
        if (!r.ok) {
          applyServerTheme(previous);
          router.refresh();
        }
      })
      .catch(() => {}); // mất mạng: giữ lựa chọn trên thiết bị; lần đồng bộ sau sẽ chỉnh lại theo tài khoản nếu cần
  };
}

const currentValue = (): string => getCookieTheme() ?? DEFAULT_THEME_ID;

/** Chọn theme: nếu CSS của theme chưa có trong trang (theme mới thêm) thì để server render lại với CSS đó. */
export function useChooseTheme(): (id: string) => void {
  const router = useRouter();
  const persist = usePersistTheme();
  return (id) => {
    const previous = currentValue();
    if (!setTheme(id)) router.refresh();
    persist(id, previous);
  };
}

/** Công tắt "Tự động theo thiết bị": bật thì tối khi hệ điều hành ở chế độ tối, còn lại Vở ô ly. Dùng chung cho cài đặt và menu nhanh. */
export function AutoThemeSwitch() {
  const auto = useThemeAuto();
  const id = useThemeId();
  const persist = usePersistTheme();
  return (
    <button
      type="button"
      className="btn btn-light btn-sm"
      aria-pressed={auto}
      onClick={() => {
        const previous = currentValue();
        setAuto(!auto);
        persist(auto ? id : "auto", previous);
      }}
    >
      {auto ? "Đang bật" : "Đang tắt"}
    </button>
  );
}
