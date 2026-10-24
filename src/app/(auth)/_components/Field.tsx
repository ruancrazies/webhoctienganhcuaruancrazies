import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; error?: string; hint?: string };

export function Field({ label, name, error, hint, ...input }: Props) {
  const errId = `${name}-error`;
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} aria-invalid={error ? true : undefined} aria-describedby={error ? errId : undefined} {...input} />
      {hint && !error ? <small className="hint">{hint}</small> : null}
      {error ? (
        <small id={errId} className="error" role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}
