/** Kiểm tra dữ liệu đăng ký/đăng nhập (G9). Hàm thuần: dùng được ở cả server lẫn test. */
import { z } from "zod";

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 72;
export const OTP_LENGTH = 6;

const email = z
  .string({ error: "Vui lòng nhập email" })
  .trim()
  .toLowerCase()
  .max(254, "Email quá dài")
  .pipe(z.email({ error: "Email không hợp lệ" }));

const password = z
  .string({ error: "Vui lòng nhập mật khẩu" })
  .min(PASSWORD_MIN, `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự`)
  .max(PASSWORD_MAX, `Mật khẩu tối đa ${PASSWORD_MAX} ký tự`);

export const usernameSchema = z
  .string({ error: "Vui lòng nhập tên đăng nhập" })
  .trim()
  .regex(USERNAME_RE, "Tên đăng nhập 3–20 ký tự: chữ không dấu, số hoặc dấu _");

const otp = z
  .string({ error: "Vui lòng nhập mã xác nhận" })
  .trim()
  .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `Mã gồm ${OTP_LENGTH} chữ số`);

const confirmMatches = (v: { password: string; confirm: string }) => v.password === v.confirm;
const confirmError = { message: "Mật khẩu nhập lại không khớp", path: ["confirm"] };

export const registerSchema = z
  .object({ username: usernameSchema, email, password, confirm: z.string({ error: "Vui lòng nhập lại mật khẩu" }) })
  .refine(confirmMatches, confirmError);

export const loginSchema = z.object({
  identifier: z
    .string({ error: "Vui lòng nhập tên đăng nhập hoặc email" })
    .trim()
    .min(1, "Vui lòng nhập tên đăng nhập hoặc email")
    .max(254),
  // Không áp độ dài tối thiểu khi đăng nhập: chỉ cần có nhập.
  password: z.string({ error: "Vui lòng nhập mật khẩu" }).min(1, "Vui lòng nhập mật khẩu").max(PASSWORD_MAX),
});

export const emailOnlySchema = z.object({ email });
export const verifySchema = z.object({ email, token: otp });
export const resetSchema = z
  .object({ email, token: otp, password, confirm: z.string({ error: "Vui lòng nhập lại mật khẩu" }) })
  .refine(confirmMatches, confirmError);

/** Lỗi đầu tiên của mỗi trường, để hiện cạnh ô nhập. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? "_");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** Có chứa "@" thì coi là email, ngược lại là tên đăng nhập (mục 5.11). */
export const isEmailIdentifier = (identifier: string): boolean => identifier.includes("@");

const AUTH_PATHS = ["/login", "/register", "/forgot", "/reset", "/verify"];

/** Chỉ cho chuyển hướng tới đường dẫn nội bộ (chống open redirect). */
export function safeNext(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f]/.test(raw)) {
    return fallback;
  }
  const path = raw.split(/[?#]/)[0];
  if (AUTH_PATHS.includes(path)) return fallback;
  return raw;
}
