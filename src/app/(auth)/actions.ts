"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthError } from "@supabase/supabase-js";
import {
  emailOnlySchema,
  fieldErrors,
  isEmailIdentifier,
  loginSchema,
  registerSchema,
  resetSchema,
  safeNext,
  verifySchema,
} from "@/core/auth";
import { clientIp } from "@/server/auth/client-ip";
import { createSupabaseServer } from "@/server/auth/supabase";
import { findEmailByUsername, isUsernameTaken } from "@/server/auth/users";
import { keyHash } from "@/server/hash";
import { hitRateLimit } from "@/server/ratelimit";
import type { FormState } from "./state";

const TOO_MANY = "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.";
const BUSY = "Hệ thống đang bận, vui lòng thử lại sau.";
const BAD_LOGIN = "Sai tên đăng nhập/email hoặc mật khẩu";
const BAD_CODE = "Mã không đúng hoặc đã hết hạn";

type Outcome = FormState | { redirectTo: string };

/** Gom lỗi bất ngờ thành một thông báo chung; redirect() chạy NGOÀI try/catch (nó hoạt động bằng cách ném lỗi). */
async function run(fn: () => Promise<Outcome>): Promise<FormState> {
  let out: Outcome;
  try {
    out = await fn();
  } catch (e) {
    console.error("[auth]", e);
    return { error: BUSY };
  }
  if ("redirectTo" in out) redirect(out.redirectTo);
  return out;
}

const pick = (raw: Record<string, unknown>, keys: string[]): Record<string, string> =>
  Object.fromEntries(keys.map((k) => [k, typeof raw[k] === "string" ? (raw[k] as string) : ""]));

const verifyUrl = (email: string, notice?: string) =>
  `/verify?email=${encodeURIComponent(email)}${notice ? `&notice=${notice}` : ""}`;

function mapAuthError(error: AuthError): string {
  if (error.code === "weak_password") return "Mật khẩu quá yếu, hãy chọn mật khẩu khác";
  if (error.code?.includes("rate_limit")) return TOO_MANY;
  if (/database error saving new user/i.test(error.message)) return "Tên đăng nhập đã được dùng";
  if ((error.status ?? 0) >= 500) return "Không gửi được email xác nhận. Vui lòng thử lại sau.";
  return BUSY;
}

// ---------------------------------------------------------------------------------------------
export async function registerAction(_: FormState, formData: FormData): Promise<FormState> {
  return run(async () => {
    const raw = Object.fromEntries(formData);
    const values = pick(raw, ["username", "email"]);
    const parsed = registerSchema.safeParse(raw);
    if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
    const { username, email, password } = parsed.data;

    const ip = clientIp(await headers());
    if (!(await hitRateLimit(`register:${ip}`, 3600, 10))) return { error: TOO_MANY, values };

    // Kiểm tra trước để báo lỗi rõ ràng; trigger tạo profile vẫn là lớp chặn cuối (index duy nhất).
    if (await isUsernameTaken(username)) {
      return { fieldErrors: { username: "Tên đăng nhập đã được dùng" }, values };
    }

    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { username } } });
    if (error) return { error: mapAuthError(error), values };

    // Email đã có tài khoản: Supabase trả kết quả "giả thành công" và không gửi mã (chống dò email).
    return { redirectTo: verifyUrl(email) };
  });
}

// ---------------------------------------------------------------------------------------------
export async function verifyAction(_: FormState, formData: FormData): Promise<FormState> {
  return run(async () => {
    const raw = Object.fromEntries(formData);
    const values = pick(raw, ["email"]);
    const parsed = verifySchema.safeParse(raw);
    if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
    const { email, token } = parsed.data;

    const ip = clientIp(await headers());
    if (!(await hitRateLimit(`verify:${ip}`, 600, 30))) return { error: TOO_MANY, values };
    if (!(await hitRateLimit(`verify-email:${keyHash(email)}`, 600, 10))) return { error: TOO_MANY, values };

    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
    if (error) return { error: BAD_CODE, values };
    return { redirectTo: "/" }; // verifyOtp đã ghi cookie phiên → đã đăng nhập
  });
}

export async function resendAction(_: FormState, formData: FormData): Promise<FormState> {
  return run(async () => {
    const parsed = emailOnlySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: "Email không hợp lệ" };
    const { email } = parsed.data;

    const ip = clientIp(await headers());
    if (!(await hitRateLimit(`resend:${ip}`, 3600, 10))) return { error: TOO_MANY };
    if (!(await hitRateLimit(`resend-email:${keyHash(email)}`, 3600, 10))) return { error: TOO_MANY };

    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) return { error: mapAuthError(error) };
    return { notice: "Nếu email hợp lệ, mã mới đã được gửi. Hãy kiểm tra cả thư rác." };
  });
}

// ---------------------------------------------------------------------------------------------
export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
  return run(async () => {
    const raw = Object.fromEntries(formData);
    const values = pick(raw, ["identifier"]);
    const next = safeNext(raw.next);
    const parsed = loginSchema.safeParse(raw);
    if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
    const { identifier, password } = parsed.data;

    const ip = clientIp(await headers());
    if (!(await hitRateLimit(`login:${ip}`, 900, 20))) return { error: TOO_MANY, values };
    // Giới hạn theo tài khoản để chặn dò mật khẩu từ nhiều IP.
    if (!(await hitRateLimit(`login-id:${keyHash(identifier)}`, 900, 10))) return { error: TOO_MANY, values };

    const email = isEmailIdentifier(identifier) ? identifier.toLowerCase() : await findEmailByUsername(identifier);
    if (!email) return { error: BAD_LOGIN, values }; // một thông báo chung, không lộ tài khoản có tồn tại

    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.code === "email_not_confirmed") {
        // Chỉ xảy ra khi mật khẩu đúng: gửi lại mã (nếu chưa vượt giới hạn) và chuyển sang trang xác nhận.
        if (await hitRateLimit(`resend-email:${keyHash(email)}`, 3600, 10)) {
          await supabase.auth.resend({ type: "signup", email });
        }
        return { redirectTo: verifyUrl(email, "unconfirmed") };
      }
      if (error.status && error.status >= 500) return { error: BUSY, values };
      return { error: BAD_LOGIN, values };
    }
    return { redirectTo: next };
  });
}

// ---------------------------------------------------------------------------------------------
export async function forgotAction(_: FormState, formData: FormData): Promise<FormState> {
  return run(async () => {
    const raw = Object.fromEntries(formData);
    const values = pick(raw, ["email"]);
    const parsed = emailOnlySchema.safeParse(raw);
    if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
    const { email } = parsed.data;

    const ip = clientIp(await headers());
    if (!(await hitRateLimit(`forgot:${ip}`, 3600, 10))) return { error: TOO_MANY, values };
    if (!(await hitRateLimit(`forgot-email:${keyHash(email)}`, 3600, 3))) return { error: TOO_MANY, values };

    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error && (error.status ?? 0) >= 500) return { error: mapAuthError(error), values };

    // Luôn chuyển sang bước nhập mã dù email có tồn tại hay không.
    return { redirectTo: `/reset?email=${encodeURIComponent(email)}` };
  });
}

export async function resetAction(_: FormState, formData: FormData): Promise<FormState> {
  return run(async () => {
    const raw = Object.fromEntries(formData);
    const values = pick(raw, ["email"]);
    const parsed = resetSchema.safeParse(raw);
    if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
    const { email, token, password } = parsed.data;

    const ip = clientIp(await headers());
    if (!(await hitRateLimit(`verify:${ip}`, 600, 30))) return { error: TOO_MANY, values };
    if (!(await hitRateLimit(`verify-email:${keyHash(email)}`, 600, 10))) return { error: TOO_MANY, values };

    const supabase = await createSupabaseServer();
    const verified = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
    if (verified.error) return { error: BAD_CODE, values };

    const updated = await supabase.auth.updateUser({ password });
    // Mật khẩu mới trùng mật khẩu cũ: không cần đổi gì, coi như xong.
    if (updated.error && updated.error.code !== "same_password") {
      return { error: mapAuthError(updated.error), values };
    }

    // Đăng xuất mọi thiết bị khác: ai đang giữ phiên cũ (có thể là kẻ đã biết mật khẩu cũ) bị loại.
    await supabase.auth.signOut({ scope: "others" });
    return { redirectTo: "/" };
  });
}

// ---------------------------------------------------------------------------------------------
export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
