"use client";

import { useActionState, useEffect, useState } from "react";
import { resendAction, verifyAction } from "../actions";
import type { FormState } from "../state";
import { Captcha } from "./Captcha";
import { Field } from "./Field";
import { FormMessage } from "./FormMessage";
import { SpamNote } from "./SpamNote";

/** Khớp max_frequency của Supabase Auth (60s giữa hai lần gửi mail cho cùng một email). */
const RESEND_COOLDOWN_SECONDS = 60;

export function VerifyForm({ email, freshCode = true }: { email: string; freshCode?: boolean }) {
  // Mã vừa được gửi khi người dùng tới trang này nên bắt đầu đếm ngược ngay (trừ khi chưa gửi mã nào).
  const [left, setLeft] = useState(freshCode ? RESEND_COOLDOWN_SECONDS : 0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const [state, action, pending] = useActionState<FormState, FormData>(verifyAction, {});
  const [resend, resendForm, resending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await resendAction(prev, formData);
    setLeft(RESEND_COOLDOWN_SECONDS);
    return result;
  }, {});
  const e = state.fieldErrors ?? {};
  return (
    <>
      <form action={action} className="form" noValidate>
        <FormMessage error={state.error} />
        <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email ?? email} error={e.email} required />
        <Field label="Mã xác nhận (6 chữ số)" name="token" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" error={e.token} required />
        <button type="submit" disabled={pending}>{pending ? "Đang xác nhận…" : "Xác nhận"}</button>
      </form>
      <SpamNote />
      <form action={resendForm} className="form form-secondary">
        <FormMessage error={resend.error} notice={resend.notice} />
        <input type="hidden" name="email" value={email} />
        <Captcha resetSignal={resend} />
        <button type="submit" className="link-button" disabled={resending || !email || left > 0}>
          {resending ? "Đang gửi…" : left > 0 ? `Gửi lại mã sau ${left}s` : "Chưa nhận được mã? Gửi lại"}
        </button>
      </form>
    </>
  );
}
