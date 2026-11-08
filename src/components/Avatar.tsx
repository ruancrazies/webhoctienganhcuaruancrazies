import { avatarOf } from "@/core/avatars";
import { assetSrcSet, assetUrl } from "@/cosmetics/assets";
import { avatarById, frameById } from "@/cosmetics/registry";

/**
 * Avatar + khung (lớp riêng xếp lên trên). Thứ tự chọn hình: ảnh minh họa trong registry → emoji cũ (chuyển tiếp,
 * bỏ khi migration giai đoạn 2 đặt profiles.avatar về null) → chữ cái đầu của tên.
 * Vùng chứa có kích thước cố định theo `--av` (và rộng thêm 24% khi có khung) nên ảnh/khung tải sau không làm dịch bố cục (CLS).
 * Trang trí (alt rỗng): tên người dùng luôn nằm cạnh.
 */
export function Avatar({ avatar, frame, username, size = "lg" }: { avatar: string | null; frame?: string | null; username: string; size?: "lg" | "sm" }) {
  const art = avatarById(avatar);
  const legacy = art ? null : avatarOf(avatar);
  const fr = frameById(frame);
  const sm = size === "sm";
  return (
    <span className={`avatar-box${sm ? " avatar-sm" : ""}${fr ? " has-frame" : ""}`} aria-hidden="true">
      <span className={`avatar${art ? " avatar-art" : ""}`} style={legacy ? { background: legacy.bg } : undefined}>
        {art ? (
          <img src={assetUrl("avatars", art.id, 96)} srcSet={assetSrcSet("avatars", art.id)} width={96} height={96} alt="" decoding="async" />
        ) : legacy ? (
          legacy.emoji
        ) : (
          username.charAt(0).toUpperCase()
        )}
      </span>
      {fr ? (
        <img className="avatar-frame" src={assetUrl("frames", fr.id, 96)} srcSet={assetSrcSet("frames", fr.id)} width={96} height={96} alt="" decoding="async" />
      ) : null}
    </span>
  );
}
