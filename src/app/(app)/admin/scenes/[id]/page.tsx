import Link from "next/link";
import { notFound } from "next/navigation";
import { DEFAULT_SCENE_KEY, SCENE_GREETING_MAX, SCENE_STATUS_LABEL, resolveSceneKey, sceneStatus } from "@/core/loginScene";
import { isKnownScene, sceneById } from "@/features/login-scene/scenes";
import { MAX_SCHEDULE_DAYS } from "@/features/login-scene/schemas";
import { getSceneConfig } from "@/server/repo";
import { ActionForm, SubmitButton } from "../ActionForm";
import { addScheduleAction, deleteScheduleAction, pinSceneAction, saveSceneAction } from "../actions";

export const dynamic = "force-dynamic";

const fmt = (d: string) => d.split("-").reverse().join("/");

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const s = sceneById((await params).id);
  return { title: `${s?.name ?? "Scene"} · Quản trị` };
}

export default async function SceneDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scene = sceneById(id);
  if (!scene) notFound();
  const cfg = await getSceneConfig();
  const now = new Date();
  const active = resolveSceneKey(now, cfg, isKnownScene);
  const row = cfg.scenes.find((r) => r.key === id);
  const status = sceneStatus(id, now, cfg, active.key);
  const schedules = cfg.schedules.filter((c) => c.sceneKey === id);
  const isDefault = id === DEFAULT_SCENE_KEY;
  const published = isDefault || row?.status === "published";

  return (
    <main className="page page-narrow">
      <Link href="/admin/scenes" className="back">‹ Scene đăng nhập</Link>
      <header className="stack" style={{ gap: 6 }}>
        <h1>{scene.name}</h1>
        <p className="muted">{SCENE_STATUS_LABEL[status]}{row?.pinned ? " · đang ghim" : ""}</p>
        <div><Link href={`/admin/scenes/${id}/preview`} className="btn btn-sm btn-light">Xem trước (cả khổ điện thoại)</Link></div>
      </header>

      <section className="sheet stack" aria-labelledby="s-use">
        <h2 id="s-use">Dùng ngay</h2>
        <p className="muted">Ghim scene này lên trang đăng nhập, kể cả ngoài lịch. Chỉ một scene được ghim; ghim sẽ tự xuất bản scene.{isDefault ? " Ghim “Mặc định” để tắt mọi scene theo mùa." : ""}</p>
        <ActionForm action={pinSceneAction} className="row">
          <input type="hidden" name="key" value={id} />
          {row?.pinned ? (
            <>
              <input type="hidden" name="pin" value="0" />
              <SubmitButton className="btn btn-sm btn-light">Bỏ ghim</SubmitButton>
            </>
          ) : (
            <>
              <input type="hidden" name="pin" value="1" />
              <SubmitButton>Dùng ngay</SubmitButton>
            </>
          )}
        </ActionForm>
      </section>

      <section className="sheet stack" aria-labelledby="s-set">
        <h2 id="s-set">Nội dung và tuỳ chọn</h2>
        <ActionForm action={saveSceneAction}>
          <input type="hidden" name="key" value={id} />
          <div className="field">
            <label htmlFor="greeting">Câu chào</label>
            <input id="greeting" name="greeting" maxLength={SCENE_GREETING_MAX} defaultValue={row?.greeting ?? ""} placeholder={scene.greeting} />
            <small className="hint">Tối đa {SCENE_GREETING_MAX} ký tự, chữ thuần. Để trống = dùng câu chào mặc định ở trên.</small>
          </div>
          {isDefault ? (
            <input type="hidden" name="status" value="published" />
          ) : (
            <div className="field">
              <label htmlFor="status">Trạng thái</label>
              <select id="status" name="status" defaultValue={published ? "published" : "draft"} className="select">
                <option value="draft">Nháp (không bao giờ hiển thị)</option>
                <option value="published">Đã xuất bản (hiển thị khi đến lịch hoặc được ghim)</option>
              </select>
            </div>
          )}
          {scene.canvas ? (
            <label className="row" htmlFor="motionEnabled">
              <input id="motionEnabled" name="motionEnabled" type="checkbox" defaultChecked={row?.motionEnabled !== false} />
              <span>Bật hiệu ứng canvas ({scene.canvas.toolLabel.toLowerCase()}, nhân vật). Tắt thì chỉ còn bản tĩnh.</span>
            </label>
          ) : null}
          <div><SubmitButton>Lưu</SubmitButton></div>
        </ActionForm>
      </section>

      {isDefault ? null : (
        <section className="sheet stack" aria-labelledby="s-cal">
          <h2 id="s-cal">Lịch tự động (giờ Việt Nam)</h2>
          <p className="muted">Mỗi năm đặt lại khoảng ngày; Tết và Trung thu đặt theo âm lịch, hệ thống không tự tính. Hai lịch trùng nhau thì độ ưu tiên cao hơn thắng. Chỉ có tác dụng khi scene đã xuất bản.</p>
          {schedules.length ? (
            <ul className="weak-list">
              {schedules.map((c) => (
                <li key={c.id}>
                  <span>{fmt(c.startsOn)} – {fmt(c.endsOn)} <span className="muted small">· ưu tiên {c.priority}</span></span>
                  <ActionForm action={deleteScheduleAction} className="row">
                    <input type="hidden" name="key" value={id} />
                    <input type="hidden" name="id" value={c.id} />
                    <SubmitButton className="btn btn-sm btn-light">Xóa<span className="sr-only"> lịch {fmt(c.startsOn)} – {fmt(c.endsOn)}</span></SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Chưa có lịch.</p>
          )}
          <h3>Thêm lịch</h3>
          <ActionForm action={addScheduleAction}>
            <input type="hidden" name="key" value={id} />
            <div className="row">
              <div className="field"><label htmlFor="startsOn">Từ ngày</label><input id="startsOn" name="startsOn" type="date" required /></div>
              <div className="field"><label htmlFor="endsOn">Đến hết ngày</label><input id="endsOn" name="endsOn" type="date" required /></div>
              <div className="field"><label htmlFor="priority">Độ ưu tiên (0–100)</label><input id="priority" name="priority" type="number" min={0} max={100} defaultValue={0} inputMode="numeric" /></div>
            </div>
            <small className="hint">Tối đa {MAX_SCHEDULE_DAYS} ngày một lịch.</small>
            <div><SubmitButton>Thêm lịch</SubmitButton></div>
          </ActionForm>
        </section>
      )}
    </main>
  );
}
