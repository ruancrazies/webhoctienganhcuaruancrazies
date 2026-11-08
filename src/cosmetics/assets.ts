/** Đường dẫn ảnh của avatar/khung: mỗi món có hai kích cỡ (96px và 192px cho màn hình 2x). */
export type AssetKind = "avatars" | "frames";
export const ASSET_SIZES = [96, 192] as const;
export const ASSET_BUDGET_BYTES = 15 * 1024;

export const assetUrl = (kind: AssetKind, id: string, size: (typeof ASSET_SIZES)[number]) => `/${kind}/${id}/${size}.webp`;
export const assetSrcSet = (kind: AssetKind, id: string) => `${assetUrl(kind, id, 96)} 1x, ${assetUrl(kind, id, 192)} 2x`;
