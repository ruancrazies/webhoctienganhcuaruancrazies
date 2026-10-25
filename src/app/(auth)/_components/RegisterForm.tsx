"use client";

import { useActionState } from "react";
import { registerAction } from "../actions";
import type { FormState } from "../state";
import { Captcha } from "./Captcha";
import { Field } from "./Field";
import { FormMessage } from "./FormMessage";
import { SpamNote } from "./SpamNote";

export function RegisterForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(registerAction, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="form" noValidate>
      <FormMessage error={state.error} />
      <Field label="Tên đăng nhập" name="username" autoComplete="username" defaultValue={state.values?.username} error={e.username} hint="3–20 ký tự: chữ không dấu, số hoặc dấu _" required />
      <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} error={e.email} required />
      <Field label="Mật khẩu" name="password" type="password" autoComplete="new-password" error={e.password} hint="Tối thiểu 6 ký tự" required />
      <Field label="Nhập lại mật khẩu" name="confirm" type="password" autoComplete="new-password" error={e.confirm} required />
      <Captcha resetSignal={state} />
      <button type="submit" disabled={pending}>{pending ? "Đang đăng ký…" : "Đăng ký"}</button>
      <SpamNote />
    </form>
  );
}
