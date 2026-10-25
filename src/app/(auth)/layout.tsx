import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-shell">
      <div className="card">
        <p className="brand"><span className="brand-mark" aria-hidden="true">Aa</span>Web học từ vựng</p>
        {children}
      </div>
    </main>
  );
}
