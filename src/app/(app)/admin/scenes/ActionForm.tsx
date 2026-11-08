"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export type ActionState = { ok?: string; error?: string };

export function SubmitButton({ children, className = "btn btn-sm" }: { children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-disabled={pending}>
      {pending ? "Đang lưu…" : children}
    </button>
  );
}

/** Form của trang quản trị: gọi server action, hiện kết quả trong vùng aria-live để screen reader đọc được. */
export function ActionForm({ action, children, className = "form" }: { action: (prev: ActionState, fd: FormData) => Promise<ActionState>; children: ReactNode; className?: string }) {
  const [state, run] = useActionState(action, {});
  return (
    <form action={run} className={className}>
      {children}
      <div role="status" aria-live="polite">
        {state.error ? <p className="banner banner-error">{state.error}</p> : null}
        {state.ok ? <p className="banner banner-ok">{state.ok}</p> : null}
      </div>
    </form>
  );
}
