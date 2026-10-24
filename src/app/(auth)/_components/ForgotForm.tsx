"use client";

import { useActionState } from "react";
import { forgotAction } from "../actions";
import type { FormState } from "../state";
import { Field } from "./Field";
import { FormMessage } from "./FormMessage";

export function ForgotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(forgotAction, {});
  return (
    <form action={action} className="form" noValidate>
      <FormMessage error={state.error} />
      <Field label="Email đã đăng ký" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} error={state.fieldErrors?.email} required />
      <button type="submit" disabled={pending}>{pending ? "Đang gửi…" : "Gửi mã đặt lại mật khẩu"}</button>
    </form>
  );
}
