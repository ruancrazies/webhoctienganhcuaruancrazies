import Link from "next/link";
import { AuthShell } from "../_components/AuthShell";
import { RegisterForm } from "../_components/RegisterForm";

export const metadata = { title: "Đăng ký · Web học từ vựng" };
// Scene theo mùa phụ thuộc ngày nên không được tĩnh hóa.
export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <AuthShell>
      <h1>Đăng ký</h1>
      <p className="muted">Chúng tôi sẽ gửi mã xác nhận 6 chữ số tới email của bạn.</p>
      <RegisterForm />
      <p className="links">
        <span>
          Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
        </span>
      </p>
    </AuthShell>
  );
}
