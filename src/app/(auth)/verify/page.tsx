import Link from "next/link";
import { supabaseCaptcha } from "@/server/captcha";
import { VerifyForm } from "../_components/VerifyForm";
import { first, type SearchParams } from "../search-params";

export const metadata = { title: "Xác nhận email · Web học từ vựng" };

export default async function VerifyPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const email = first(sp.email) ?? "";
  const unconfirmed = first(sp.notice) === "unconfirmed";
  // Khi Supabase tự xác minh CAPTCHA, đăng nhập không tự gửi lại mã được: người dùng bấm "Gửi lại" ở dưới.
  const resent = unconfirmed && !supabaseCaptcha();
  return (
    <>
      <h1>Xác nhận email</h1>
      <p className="muted">
        {unconfirmed
          ? resent
            ? "Tài khoản này chưa được xác nhận email. Chúng tôi đã gửi lại mã mới."
            : "Tài khoản này chưa được xác nhận email. Hãy bấm “Gửi lại mã” ở cuối trang để nhận mã mới."
          : "Nhập mã 6 chữ số vừa được gửi tới email của bạn."}{" "}
        Nếu không thấy, hãy kiểm tra thư rác.
      </p>
      <VerifyForm email={email} freshCode={!unconfirmed || resent} />
      <p className="links">
        <Link href="/login">Quay lại đăng nhập</Link>
      </p>
    </>
  );
}
