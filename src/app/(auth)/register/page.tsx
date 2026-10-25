import Link from "next/link";
import { RegisterForm } from "../_components/RegisterForm";

export const metadata = { title: "Đăng ký · Web học từ vựng" };

export default function RegisterPage() {
  return (
    <>
      <h1>Đăng ký</h1>
      <p className="muted">Chúng tôi sẽ gửi mã xác nhận 6 chữ số tới email của bạn.</p>
      <RegisterForm />
      <p className="links">
        <span>
          Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
        </span>
      </p>
    </>
  );
}
