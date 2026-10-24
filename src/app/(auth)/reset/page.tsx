import Link from "next/link";
import { ResetForm } from "../_components/ResetForm";
import { first, type SearchParams } from "../search-params";

export const metadata = { title: "Đặt lại mật khẩu · English Game" };

export default async function ResetPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  return (
    <>
      <h1>Đặt lại mật khẩu</h1>
      <p className="muted">
        Nếu email có tài khoản, mã 6 chữ số đã được gửi tới đó (kiểm tra cả thư rác). Nhập mã và mật khẩu mới.
      </p>
      <ResetForm email={first(sp.email) ?? ""} />
      <p className="links">
        <Link href="/forgot">Gửi lại mã</Link>
        <Link href="/login">Quay lại đăng nhập</Link>
      </p>
    </>
  );
}
