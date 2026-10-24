"use client";

import { useActionState } from "react";
import { resendAction, verifyAction } from "../actions";
import type { FormState } from "../state";
import { Field } from "./Field";
import { FormMessage } from "./FormMessage";

export function VerifyForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(verifyAction, {});
  const [resend, resendForm, resending] = useActionState<FormState, FormData>(resendAction, {});
  const e = state.fieldErrors ?? {};
  return (
    <>
      <form action={action} className="form" noValidate>
        <FormMessage error={state.error} />
        <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email ?? email} error={e.email} required />
        <Field label="Mã xác nhận (6 chữ số)" name="token" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" error={e.token} required />
        <button type="submit" disabled={pending}>{pending ? "Đang xác nhận…" : "Xác nhận"}</button>
      </form>
      <form action={resendForm} className="form form-secondary">
        <FormMessage error={resend.error} notice={resend.notice} />
        <input type="hidden" name="email" value={email} />
        <button type="submit" className="link-button" disabled={resending || !email}>
          {resending ? "Đang gửi…" : "Chưa nhận được mã? Gửi lại"}
        </button>
      </form>
    </>
  );
}
