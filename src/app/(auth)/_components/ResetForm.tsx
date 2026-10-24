"use client";

import { useActionState } from "react";
import { resetAction } from "../actions";
import type { FormState } from "../state";
import { Field } from "./Field";
import { FormMessage } from "./FormMessage";

export function ResetForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetAction, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="form" noValidate>
      <FormMessage error={state.error} />
      <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email ?? email} error={e.email} required />
      <Field label="Mã trong email (6 chữ số)" name="token" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" error={e.token} required />
      <Field label="Mật khẩu mới" name="password" type="password" autoComplete="new-password" error={e.password} hint="Tối thiểu 6 ký tự" required />
      <Field label="Nhập lại mật khẩu mới" name="confirm" type="password" autoComplete="new-password" error={e.confirm} required />
      <button type="submit" disabled={pending}>{pending ? "Đang lưu…" : "Đặt lại mật khẩu"}</button>
    </form>
  );
}
