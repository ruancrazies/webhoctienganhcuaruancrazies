import { avatarOf } from "@/core/avatars";

/** Avatar: biểu tượng đã chọn, hoặc chữ cái đầu của tên nếu chưa chọn. Trang trí (tên đã có ở cạnh). */
export function Avatar({ avatar, username, size = "lg" }: { avatar: string | null; username: string; size?: "lg" | "sm" }) {
  const a = avatarOf(avatar);
  return (
    <span className={`avatar${size === "sm" ? " avatar-sm" : ""}`} style={a ? { background: a.bg } : undefined} aria-hidden="true">
      {a ? a.emoji : username.charAt(0).toUpperCase()}
    </span>
  );
}
