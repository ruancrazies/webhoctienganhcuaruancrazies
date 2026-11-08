import Link from "next/link";
import { safeNext } from "@/core/auth";
import { sceneCss } from "@/features/login-scene/css";
import { getActiveScene } from "@/features/login-scene/getActiveScene";
import { LoginScene } from "@/features/login-scene/LoginScene";
import { LoginForm } from "../_components/LoginForm";
import { first, type SearchParams } from "../search-params";

export const metadata = { title: "Đăng nhập · Web học từ vựng" };
// Scene phụ thuộc ngày (giờ VN) nên trang không được tĩnh hóa; cấu hình đã cache theo tag nên không tốn truy vấn DB mỗi lượt.
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const next = safeNext(first(sp.next), "");
  const { meta, greeting, motion } = await getActiveScene({ devScene: first(sp.scene) });
  const t = meta.tokens;
  return (
    <>
      {/* CSS biến của scene đang bật: nằm sẵn trong HTML nên không nháy màu */}
      <style dangerouslySetInnerHTML={{ __html: sceneCss(meta) }} />
      <main>
        <LoginScene
          id={meta.id}
          greeting={greeting}
          tagline={meta.tagline}
          canvas={motion ? meta.canvas : undefined}
          pal={{ glow: t.glow, accent: t.stageAccent, text: t.stageText, bg: t.stageBg, bg2: t.stageBg2 }}
        >
          <div className="auth-card">
            <p className="brand">Web học từ vựng</p>
            <h1>Đăng nhập</h1>
            <LoginForm next={next || undefined} />
            <p className="links">
              <Link href="/forgot">Quên mật khẩu?</Link>
              <span>
                Chưa có tài khoản? <Link href="/register">Đăng ký</Link>
              </span>
            </p>
          </div>
        </LoginScene>
      </main>
    </>
  );
}
