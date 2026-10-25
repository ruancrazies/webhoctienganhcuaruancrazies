"use client";

import { useActionState } from "react";
import { forgotAction } from "../actions";
import type { FormState } from "../state";
import { Captcha } from "./Captcha";
import { Field } from "./Field";
import { FormMessage } from "./FormMessage";
import { SpamNote } from "./SpamNote";

export function ForgotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(forgotAction, {});
  return (
    <form action={action} className="form" noValidate>
      <FormMessage error={state.error} />
      <Field label="Email đã đăng ký" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} error={state.fieldErrors?.email} required />
      <Captcha resetSignal={state} />
      <button type="submit" disabled={pending}>{pending ? "Đang gửi…" : "Gửi mã đặt lại mật khẩu"}</button>
      <SpamNote what="Thư chứa mã đặt lại mật khẩu" />
    </form>
  );
}
