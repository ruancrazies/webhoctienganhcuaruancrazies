"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { useSceneLit } from "@/features/login-scene/LitContext";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string; name: string; error?: string };

/**
 * Ô mật khẩu LUÔN là <input> thật (trình quản lý mật khẩu, dán, screen reader đều cần). Nút "Hiện" đổi type giữa password/text.
 * Chùm sáng của Scene chỉ là CÁCH BẬT THÊM cho cùng trạng thái đó (aria-pressed đồng bộ); không có nó thì nút Hiện vẫn đủ dùng.
 * Tự ẩn khi: chùm sáng rời ô, ô mất focus, hoặc gửi form.
 */
export function PasswordField({ label, name, error, ...input }: Props) {
  const lit = useSceneLit();
  const [manual, setManual] = useState(false); // người dùng bấm nút Hiện
  const [hold, setHold] = useState(false); // bỏ qua ánh sáng hiện tại (sau khi ẩn bằng tay / mất focus / gửi form) cho tới khi sáng lại từ đầu
  const ref = useRef<HTMLInputElement>(null);
  const errId = `${name}-error`;

  useEffect(() => {
    if (!lit) setHold(false);
  }, [lit]);

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const hide = () => {
      setManual(false);
      setHold(true);
    };
    form.addEventListener("submit", hide);
    return () => form.removeEventListener("submit", hide);
  }, []);

  const shown = manual || (lit && !hold);
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <div className="pw" data-scene-target="password" data-shown={shown || undefined}>
        <input
          ref={ref}
          id={name}
          name={name}
          type={shown ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          onBlur={() => {
            setManual(false);
            setHold(true);
          }}
          {...input}
        />
        <button
          type="button"
          className="pw-toggle"
          aria-pressed={shown}
          aria-label="Hiện mật khẩu"
          // Giữ focus ở ô nhập khi bấm nút, để onBlur của ô không ẩn ngay lúc vừa hiện.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (shown) {
              setManual(false);
              if (lit) setHold(true);
            } else setManual(true);
          }}
        >
          Hiện
        </button>
      </div>
      {error ? (
        <small id={errId} className="error" role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}
