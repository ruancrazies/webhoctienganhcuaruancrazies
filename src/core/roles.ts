/** Vai trò người dùng (profiles.role). Chỉ hai giá trị; đặt admin bằng SQL thủ công, không có API nào tự nâng quyền. */
export type Role = "user" | "admin";
export const ROLES: readonly Role[] = ["user", "admin"];

/** Giá trị lạ, null hay thiếu → "user" (an toàn: không bao giờ vô tình thành admin). */
export const parseRole = (v: unknown): Role => (v === "admin" ? "admin" : "user");
export const isAdminRole = (v: unknown): boolean => v === "admin";
