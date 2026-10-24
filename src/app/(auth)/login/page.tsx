import Link from "next/link";
import { safeNext } from "@/core/auth";
import { LoginForm } from "../_components/LoginForm";
import { first, type SearchParams } from "../search-params";

export const metadata = { title: "Đăng nhập · English Game" };

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const next = safeNext(first(sp.next), "");
  return (
    <>
      <h1>Đăng nhập</h1>
      <LoginForm next={next || undefined} />
      <p className="links">
        <Link href="/forgot">Quên mật khẩu?</Link>
        <span>
          Chưa có tài khoản? <Link href="/register">Đăng ký</Link>
        </span>
      </p>
    </>
  );
}
