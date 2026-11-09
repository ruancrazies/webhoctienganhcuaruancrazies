import type { ReactNode } from "react";
import { sceneCss } from "@/features/login-scene/css";
import { getActiveScene } from "@/features/login-scene/getActiveScene";
import { LoginScene } from "@/features/login-scene/LoginScene";

/**
 * Khung cho các trang auth còn lại (đăng ký, quên/đặt lại mật khẩu, xác nhận): dùng đúng Scene admin đang bật theo mùa
 * (bản tĩnh, không canvas) để cả cụm trang ngoài đăng nhập đồng nhất và không dính theme người dùng chọn bên trong app.
 */
export async function AuthShell({ children }: { children: ReactNode }) {
  const { meta, greeting } = await getActiveScene({});
  const t = meta.tokens;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: sceneCss(meta) }} />
      <main>
        <LoginScene id={meta.id} greeting={greeting} tagline={meta.tagline} pal={{ glow: t.glow, accent: t.stageAccent, text: t.stageText, bg: t.stageBg, bg2: t.stageBg2 }}>
          <div className="auth-card">
            <p className="brand">Web học từ vựng</p>
            {children}
          </div>
        </LoginScene>
      </main>
    </>
  );
}
