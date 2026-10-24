import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "./supabase";

export type SessionUser = { id: string; email: string };

export class UnauthorizedError extends Error {
  constructor() {
    super("Chưa đăng nhập");
  }
}

/** Người dùng của phiên hiện tại (xác thực với Supabase Auth, không tin cookie mù quáng). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
});

/** Cho trang: chưa đăng nhập thì chuyển tới /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Cho Route Handler (Bước 4): ném UnauthorizedError để trả 401. */
export async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}
