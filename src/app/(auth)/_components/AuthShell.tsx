import type { ReactNode } from "react";

/** Khung tờ vở cho các trang auth còn lại (đăng ký, quên/đặt lại mật khẩu, xác nhận). Trang /login có khung Scene riêng. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <p className="brand">Web học từ vựng</p>
        {children}
      </div>
    </main>
  );
}
