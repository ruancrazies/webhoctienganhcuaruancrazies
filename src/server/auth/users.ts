import "server-only";
import { createAdminClient } from "../db";

/** Thoát ký tự đặc biệt của LIKE (đặc biệt là "_" khớp mọi ký tự). */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

async function profileIdByUsername(username: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id")
    .ilike("username", escapeLike(username))
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`profiles: ${error.message}`);
  return (data?.id as string | undefined) ?? null;
}

/** Id người đang giữ tên này (không phân biệt hoa thường), hoặc null nếu tên còn trống. */
export const usernameOwner = profileIdByUsername;

/** Tên đăng nhập không phân biệt hoa thường (khớp index profiles_username_idx). */
export async function isUsernameTaken(username: string): Promise<boolean> {
  return (await profileIdByUsername(username)) !== null;
}

/** Tên đăng nhập → email (chỉ ở server, dùng service_role; mục 5.11). */
export async function findEmailByUsername(username: string): Promise<string | null> {
  const id = await profileIdByUsername(username);
  if (!id) return null;
  const { data, error } = await createAdminClient().auth.admin.getUserById(id);
  if (error) throw new Error(`getUserById: ${error.message}`);
  return data.user?.email ?? null;
}
