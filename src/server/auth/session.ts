import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { isAdminRole } from "../../core/roles";
import { getRole } from "../repo/profiles";
import { createSupabaseServer } from "./supabase";

export type SessionUser = { id: string; email: string };

export class UnauthorizedError extends Error {
  constructor() {
    super("Chưa đăng nhập");
  }
}

/** Đã đăng nhập nhưng không phải admin: Route Handler/server action trả 403. */
export class ForbiddenError extends Error {
  constructor() {
    super("Không có quyền");
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

/**
 * Cho trang /admin/*: không phải admin thì trả 404 (không lộ việc trang quản trị có tồn tại).
 * Đọc vai trò từ DB ở server; proxy.ts chỉ là lớp tiện lợi, lớp bảo vệ thật là hàm này (giống requireUser).
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdminRole(await getRole(user.id))) notFound();
  return user;
}

/** Cho server action và Route Handler của quản trị: ném UnauthorizedError (401) hoặc ForbiddenError (403). */
export async function requireAdminId(): Promise<string> {
  const id = await requireUserId();
  if (!isAdminRole(await getRole(id))) throw new ForbiddenError();
  return id;
}
