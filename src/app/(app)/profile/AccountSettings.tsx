"use client";

import { useActionState } from "react";
import { Field } from "@/app/(auth)/_components/Field";
import { FormMessage } from "@/app/(auth)/_components/FormMessage";
import type { FormState } from "@/app/(auth)/state";
import { AVATARS } from "@/core/avatars";
import { updateAvatarAction, updateUsernameAction } from "./actions";

export function UsernameForm({ username }: { username: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateUsernameAction, {});
  return (
    <form action={action} className="set-block" noValidate>
      <div>
        <b>Tên đăng nhập</b>
        <p className="muted">3–20 ký tự: chữ không dấu, số hoặc dấu _. Bạn có thể đăng nhập bằng tên mới ngay.</p>
      </div>
      <FormMessage error={state.error} notice={state.notice} />
      <Field
        label="Tên mới"
        name="username"
        autoComplete="username"
        maxLength={20}
        defaultValue={state.values?.username ?? username}
        error={state.fieldErrors?.username}
        required
      />
      <div>
        <button type="submit" className="btn btn-sm" disabled={pending}>{pending ? "Đang lưu…" : "Lưu tên"}</button>
      </div>
    </form>
  );
}

export function AvatarPicker({ avatar, username }: { avatar: string | null; username: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateAvatarAction, {});
  return (
    <form action={action} className="set-block">
      <div>
        <b>Avatar</b>
        <p className="muted">Hiện cạnh tên của bạn trên bảng xếp hạng.</p>
      </div>
      <FormMessage error={state.error} notice={state.notice} />
      <fieldset className="av-grid">
        <legend className="sr-only">Chọn avatar</legend>
        <label className="av-opt" title="Chữ cái đầu của tên">
          <input type="radio" name="avatar" value="" defaultChecked={!avatar} />
          <span className="av-letter">{username.charAt(0).toUpperCase()}</span>
          <i className="sr-only">Chữ cái đầu</i>
        </label>
        {AVATARS.map((a) => (
          <label key={a.id} className="av-opt" title={a.label}>
            <input type="radio" name="avatar" value={a.id} defaultChecked={avatar === a.id} />
            <span style={{ background: a.bg }}>{a.emoji}</span>
            <i className="sr-only">{a.label}</i>
          </label>
        ))}
      </fieldset>
      <div>
        <button type="submit" className="btn btn-sm" disabled={pending}>{pending ? "Đang lưu…" : "Lưu avatar"}</button>
      </div>
    </form>
  );
}
