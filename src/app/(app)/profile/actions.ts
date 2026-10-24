"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/(auth)/state";
import { isAvatarId } from "@/core/avatars";
import { usernameSchema } from "@/core/auth";
import { requireUser } from "@/server/auth/session";
import { usernameOwner } from "@/server/auth/users";
import { RepoError } from "@/server/errors";
import { hitRateLimit } from "@/server/ratelimit";
import { getProfile, updateAvatar, updateUsername } from "@/server/repo";

const BUSY = "Hệ thống đang bận, vui lòng thử lại sau.";
const TOO_MANY = "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.";
const TAKEN = "Tên đăng nhập đã được dùng";

export async function updateUsernameAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(); // redirect() ném lỗi nên phải đứng ngoài try/catch
  const raw = formData.get("username");
  const values = { username: typeof raw === "string" ? raw : "" };

  const parsed = usernameSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: { username: parsed.error.issues[0]?.message ?? "Tên không hợp lệ" }, values };
  const username = parsed.data;

  try {
    if (!(await hitRateLimit(`username:${user.id}`, 3600, 5))) return { error: TOO_MANY, values };

    const profile = await getProfile(user.id);
    if (profile?.username === username) return { notice: "Tên đăng nhập chưa thay đổi.", values };

    // Cho phép đổi hoa/thường của chính mình (index duy nhất không phân biệt hoa thường).
    const owner = await usernameOwner(username);
    if (owner && owner !== user.id) return { fieldErrors: { username: TAKEN }, values };

    await updateUsername(user.id, username);
  } catch (e) {
    if (e instanceof RepoError && e.code === "23505") return { fieldErrors: { username: TAKEN }, values };
    console.error("[profile:username]", e);
    return { error: BUSY, values };
  }

  revalidatePath("/profile");
  return { notice: "Đã đổi tên đăng nhập.", values: { username } };
}

export async function updateAvatarAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = formData.get("avatar");
  // Chuỗi rỗng = bỏ avatar, dùng chữ cái đầu của tên.
  if (raw !== "" && !isAvatarId(raw)) return { error: "Avatar không hợp lệ" };

  try {
    if (!(await hitRateLimit(`avatar:${user.id}`, 3600, 30))) return { error: TOO_MANY };
    await updateAvatar(user.id, raw === "" ? null : (raw as string));
  } catch (e) {
    console.error("[profile:avatar]", e);
    return { error: BUSY };
  }

  revalidatePath("/profile");
  return { notice: "Đã đổi avatar." };
}
