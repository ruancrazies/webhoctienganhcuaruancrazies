import type { ReactNode } from "react";
import { requireAdmin } from "@/server/auth/session";

/** Mọi trang /admin/* chỉ dành cho admin (vai trò đọc từ DB ở server). Người khác nhận 404. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return children;
}
