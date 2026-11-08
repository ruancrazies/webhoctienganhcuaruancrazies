import Link from "next/link";
import { SCENE_STATUS_LABEL, resolveSceneKey, sceneStatus, type SceneStatus } from "@/core/loginScene";
import { isKnownScene, SCENES } from "@/features/login-scene/scenes";
import { getSceneConfig } from "@/server/repo";

export const metadata = { title: "Scene đăng nhập · Quản trị" };
export const dynamic = "force-dynamic";

const CHIP: Record<SceneStatus, string> = { active: "chip chip-good", scheduled: "chip chip-mark", published: "chip", draft: "chip chip-plain", expired: "chip chip-warn" };
const fmt = (d: string) => d.split("-").reverse().join("/");

export default async function ScenesPage() {
  const cfg = await getSceneConfig();
  const now = new Date();
  const active = resolveSceneKey(now, cfg, isKnownScene);
  const activeScene = SCENES.find((s) => s.id === active.key);
  const SOURCE = { pinned: "đang ghim (dùng ngay)", schedule: "theo lịch", default: "mặc định" } as const;
  return (
    <main className="page">
      <Link href="/admin" className="back">‹ Quản trị</Link>
      <header className="stack" style={{ gap: 6 }}>
        <h1>Scene đăng nhập</h1>
        <p className="muted">
          Đang hiển thị: <b>{activeScene?.name ?? active.key}</b> ({SOURCE[active.source]}). Chọn scene, đặt lịch theo giờ Việt Nam hoặc dùng ngay; không sửa được form đăng nhập.
        </p>
      </header>

      <section className="stack" aria-label="Danh sách scene">
        {SCENES.map((s) => {
          const row = cfg.scenes.find((r) => r.key === s.id);
          const status = sceneStatus(s.id, now, cfg, active.key);
          const schedules = cfg.schedules.filter((c) => c.sceneKey === s.id);
          return (
            <article key={s.id} className="sheet sheet-plain stack" aria-labelledby={`sc-${s.id}`}>
              <div className="spread">
                <h2 id={`sc-${s.id}`}>{s.name}</h2>
                <span className="row">
                  <span className={CHIP[status]}>{SCENE_STATUS_LABEL[status]}</span>
                  {row?.pinned ? <span className="chip chip-mark">Đang ghim</span> : null}
                  {s.active === false ? <span className="chip chip-warn">Ngừng cung cấp</span> : null}
                  {s.canvas ? (row?.motionEnabled === false ? <span className="chip chip-plain">Hiệu ứng: tắt</span> : <span className="chip chip-plain">Hiệu ứng: bật</span>) : <span className="chip chip-plain">Chỉ bản tĩnh</span>}
                </span>
              </div>
              <p className="muted">“{row?.greeting?.trim() || s.greeting}”</p>
              {schedules.length ? (
                <ul className="weak-list">
                  {schedules.map((c) => (
                    <li key={c.id}>
                      <span>{fmt(c.startsOn)} – {fmt(c.endsOn)}</span>
                      <span className="muted small">ưu tiên {c.priority}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">{s.id === "default" ? "Dùng khi không có scene nào khác." : "Chưa có lịch."}</p>
              )}
              <div className="row">
                <Link href={`/admin/scenes/${s.id}`} className="btn btn-sm">Quản lý</Link>
                <Link href={`/admin/scenes/${s.id}/preview`} className="btn btn-sm btn-light">Xem trước</Link>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
