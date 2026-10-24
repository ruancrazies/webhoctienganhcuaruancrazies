import Link from "next/link";
import { ForgotForm } from "../_components/ForgotForm";

export const metadata = { title: "Quên mật khẩu · English Game" };

export default function ForgotPage() {
  return (
    <>
      <h1>Quên mật khẩu</h1>
      <p className="muted">Nhập email đã đăng ký, chúng tôi sẽ gửi mã để đặt lại mật khẩu.</p>
      <ForgotForm />
      <p className="links">
        <Link href="/login">Quay lại đăng nhập</Link>
      </p>
    </>
  );
}
