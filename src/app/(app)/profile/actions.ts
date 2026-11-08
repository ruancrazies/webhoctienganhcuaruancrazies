"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/app/(auth)/state";
import { isAvatarId } from "@/core/avatars";
import { usernameSchema } from "@/core/auth";
import { THEME_AUTO } from "@/core/cosmetics";
import { getCurrentUser, requireUser } from "@/server/auth/session";
import { readThemeCookie, writeThemeCookie } from "@/server/auth/themeCookie";
import { usernameOwner } from "@/server/auth/users";
import { RepoError, ServiceError } from "@/server/errors";
import { hitRateLimit } from "@/server/ratelimit";
import { getProfile, updateAvatar, updateUsername } from "@/server/repo";
import { equipCosmetic, pollCosmetics, type PollResult } from "@/server/services";

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

// ---------------- Cosmetic: chọn dùng + việc nền ----------------

const equipSchema = z.object({
  kind: z.enum(["theme", "avatar", "frame"]),
  id: z.string().regex(/^[a-z][a-z0-9-]{1,23}$/).nullable(),
});

export type EquipResult = { ok: true } | { ok: false; error: string };

/**
 * Chọn dùng một theme/avatar/khung. Server kiểm sở hữu và hạn dùng (client chỉ là gợi ý); theme còn ghi cookie `eg-theme`
 * để lần render sau đúng màu ngay. `id` null = về mặc định; theme còn nhận "auto" (theo thiết bị).
 */
export async function equipCosmeticAction(input: { kind: string; id: string | null }): Promise<EquipResult> {
  const user = await requireUser();
  const parsed = equipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Yêu cầu không hợp lệ." };
  const { kind, id } = parsed.data;
  try {
    const look = await equipCosmetic(user.id, kind, id);
    if (kind === "theme") await writeThemeCookie(look.auto ? THEME_AUTO : look.theme);
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false, error: e.message };
    console.error("[profile:equip]", e);
    return { ok: false, error: BUSY };
  }
  revalidatePath("/", "layout"); // vẽ lại khung: avatar/khung ở thanh trên, CSS của theme mới trong <head>
  return { ok: true };
}

/**
 * Việc nền của khung (app), trình duyệt gọi tối đa mỗi phút một lần: cấp món theo level, đồng bộ theme theo tài khoản,
 * giao thông báo mở khóa/hết hạn. Chưa đăng nhập hoặc lỗi → trả "không có gì" (không bao giờ làm phiền người dùng).
 */
export async function pollCosmeticsAction(ack: boolean): Promise<PollResult> {
  const none: PollResult = { messages: [], theme: null, changed: false };
  try {
    const user = await getCurrentUser();
    if (!user) return none;
    const result = await pollCosmetics(user.id, { ack: ack === true, cookieTheme: await readThemeCookie() });
    if (result.theme !== null && result.theme !== (await readThemeCookie())) await writeThemeCookie(result.theme);
    return result;
  } catch (e) {
    console.error("[profile:poll]", e);
    return none;
  }
}
