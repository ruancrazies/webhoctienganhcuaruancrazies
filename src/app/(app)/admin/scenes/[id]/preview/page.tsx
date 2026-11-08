import Link from "next/link";
import { notFound } from "next/navigation";
import { sceneCss } from "@/features/login-scene/css";
import { sceneView } from "@/features/login-scene/getActiveScene";
import { LoginScene } from "@/features/login-scene/LoginScene";
import { sceneById } from "@/features/login-scene/scenes";
import { LoginForm } from "@/app/(auth)/_components/LoginForm";
import { getSceneConfig } from "@/server/repo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Xem trước Scene · Quản trị" };

/**
 * Xem trước nằm ở đây chứ không phải /login: proxy đưa người đã đăng nhập ra khỏi /login (GUEST_ONLY), nên admin không xem được ở đó.
 * Cùng <LoginScene> với trang thật, form bị vô hiệu. Khổ điện thoại = khung 375px (bố cục dùng container query nên đúng như điện thoại thật).
 * Xem được cả scene NHÁP và câu chào chưa xuất bản; người chưa đăng nhập/không phải admin không tới được đây (layout /admin gọi requireAdmin).
 */
export default async function ScenePreviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ d?: string }> }) {
  const { id } = await params;
  const meta = sceneById(id);
  if (!meta) notFound();
  const mobile = (await searchParams).d === "mobile";
  const cfg = await getSceneConfig();
  const { greeting, motion } = sceneView(meta, cfg.scenes.find((s) => s.key === id));
  const t = meta.tokens;
  return (
    <main className="page">
      <Link href={`/admin/scenes/${id}`} className="back">‹ {meta.name}</Link>
      <header className="spread">
        <h1>Xem trước: {meta.name}</h1>
        <nav className="row" aria-label="Khổ xem trước">
          <Link href={`/admin/scenes/${id}/preview`} className={`btn btn-sm ${mobile ? "btn-light" : ""}`} aria-current={mobile ? undefined : "page"}>Máy tính</Link>
          <Link href={`/admin/scenes/${id}/preview?d=mobile`} className={`btn btn-sm ${mobile ? "" : "btn-light"}`} aria-current={mobile ? "page" : undefined}>Điện thoại (375px)</Link>
        </nav>
      </header>
      <style dangerouslySetInnerHTML={{ __html: sceneCss(meta) }} />
      <div style={{ width: mobile ? 375 : undefined, maxWidth: "100%", margin: "0 auto", border: "1.5px solid var(--accent)", borderRadius: 12, overflow: "hidden" }}>
        <LoginScene
          id={meta.id}
          greeting={greeting}
          tagline={meta.tagline}
          canvas={motion ? meta.canvas : undefined}
          pal={{ glow: t.glow, accent: t.stageAccent, text: t.stageText, bg: t.stageBg, bg2: t.stageBg2 }}
          preview
        >
          <div className="auth-card">
            <p className="brand">Web học từ vựng</p>
            <h2 className="ls-card-title">Đăng nhập</h2>
            <LoginForm preview />
          </div>
        </LoginScene>
      </div>
      <p className="muted small">Hiệu ứng tự tắt nếu thiết bị bật “giảm chuyển động” hoặc tiết kiệm dữ liệu; lúc đó bạn thấy bản tĩnh như người dùng thật.</p>
    </main>
  );
}
