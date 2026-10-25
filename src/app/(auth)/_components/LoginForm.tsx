"use client";

import { useActionState } from "react";
import { loginAction } from "../actions";
import type { FormState } from "../state";
import { Captcha } from "./Captcha";
import { Field } from "./Field";
import { FormMessage } from "./FormMessage";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="form" noValidate>
      <FormMessage error={state.error} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label="Tên đăng nhập hoặc email" name="identifier" autoComplete="username" defaultValue={state.values?.identifier} error={e.identifier} required />
      <Field label="Mật khẩu" name="password" type="password" autoComplete="current-password" error={e.password} required />
      <Captcha resetSignal={state} />
      <button type="submit" disabled={pending}>{pending ? "Đang đăng nhập…" : "Đăng nhập"}</button>
    </form>
  );
}
