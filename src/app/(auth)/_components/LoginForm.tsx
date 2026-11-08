"use client";

import { useActionState } from "react";
import { loginAction } from "../actions";
import type { FormState } from "../state";
import { Captcha } from "./Captcha";
import { Field } from "./Field";
import { FormMessage } from "./FormMessage";
import { PasswordField } from "./PasswordField";

/**
 * `preview`: dùng trong xem trước của admin. Cùng markup nhưng KHÔNG gửi được (nút bị vô hiệu, ô chỉ đọc có sẵn mật khẩu mẫu,
 * không Turnstile) để admin thử chùm sáng/nút Hiện mà không đăng nhập thật.
 */
export function LoginForm({ next, preview }: { next?: string; preview?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});
  const e = state.fieldErrors ?? {};
  if (preview) {
    return (
      <form className="form" noValidate onSubmit={(ev) => ev.preventDefault()}>
        <p className="note">Xem trước: form không gửi được. Thử kéo công cụ tới ô mật khẩu để thấy hiệu ứng.</p>
        <Field label="Tên đăng nhập hoặc email" name="identifier" autoComplete="off" defaultValue="hocvien01" readOnly />
        <PasswordField label="Mật khẩu" name="password" autoComplete="off" defaultValue="mat-khau-mau" readOnly />
        <button type="submit" disabled>Đăng nhập</button>
      </form>
    );
  }
  return (
    <form action={action} className="form" noValidate>
      <FormMessage error={state.error} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label="Tên đăng nhập hoặc email" name="identifier" autoComplete="username" defaultValue={state.values?.identifier} error={e.identifier} required />
      <PasswordField label="Mật khẩu" name="password" autoComplete="current-password" error={e.password} required />
      <Captcha resetSignal={state} />
      <button type="submit" disabled={pending}>{pending ? "Đang đăng nhập…" : "Đăng nhập"}</button>
    </form>
  );
}
