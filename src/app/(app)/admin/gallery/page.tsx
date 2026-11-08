import path from "node:path";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { themeCss } from "@/cosmetics/core/css";
import { RARITY_LABEL, THEME_GROUP_LABEL } from "@/cosmetics/core/define";
import type { Unlock } from "@/cosmetics/core/unlock";
import { checkAssets, checkTheme, type Check } from "@/cosmetics/checks";
import { AVATARS, FRAMES, THEMES } from "@/cosmetics/registry";
import { checkScene } from "@/features/login-scene/checks";
import { SCENES } from "@/features/login-scene/scenes";

export const metadata = { title: "Gallery · Quản trị" };
export const dynamic = "force-dynamic";

const unlockText = (u: Unlock): string =>
  u.type === "default" ? "Mặc định" : u.type === "level" ? `Level ${u.level}` : u.type === "event" ? `Sự kiện: ${u.event}` : "Admin/phần thưởng tặng";

function Checks({ checks }: { checks: Check[] }) {
  const bad = checks.filter((c) => !c.ok);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <p className={bad.length ? "err" : "small"}>
        {bad.length ? `Không đạt ${bad.length}/${checks.length} kiểm tra` : `Đạt ${checks.length}/${checks.length} kiểm tra`}
      </p>
      {bad.length ? (
        <ul className="weak-list">
          {bad.map((c) => (
            <li key={c.label}>
              <span>✗ {c.label}</span>
              <span className="muted small">{c.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <details>
        <summary className="small">Xem toàn bộ kiểm tra</summary>
        <table className="gal-table">
          <caption className="sr-only">Kết quả kiểm tra</caption>
          <tbody>
            {checks.map((c) => (
              <tr key={c.label}>
                <th scope="row">{c.label}</th>
                <td>{c.ok ? "Đạt" : "Không đạt"}</td>
                <td className="muted">{c.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export default function GalleryPage() {
  const pub = path.join(process.cwd(), "public");
  const themes = THEMES.map((t) => ({ t, checks: checkTheme(t) }));
  const avatars = AVATARS.map((a) => ({ a, checks: checkAssets("avatars", a.id, pub) }));
  const frames = FRAMES.map((f) => ({ f, checks: checkAssets("frames", f.id, pub) }));
  const scenes = SCENES.map((x) => ({ x, checks: checkScene(x) }));
  const failing = [...themes, ...avatars, ...frames, ...scenes].filter((x) => x.checks.some((c) => !c.ok)).length;

  return (
    <main className="page">
      {/* CSS của mọi theme (giới hạn bởi [data-theme=id]) để xem trước từng ô mà không đổi cả trang */}
      <style dangerouslySetInnerHTML={{ __html: THEMES.map(themeCss).join("\n") }} />
      <Link href="/admin" className="back">‹ Quản trị</Link>
      <header className="stack" style={{ gap: 6 }}>
        <h1>Gallery</h1>
        <p className={failing ? "err" : "muted"}>
          {THEMES.length} theme · {AVATARS.length} avatar · {FRAMES.length} khung · {SCENES.length} scene ·{" "}
          {failing ? `${failing} món chưa đạt kiểm tra` : "mọi món đều đạt kiểm tra"}
        </p>
      </header>

      <section className="stack" aria-labelledby="g-themes">
        <h2 id="g-themes">Theme</h2>
        <div className="gal-grid">
          {themes.map(({ t, checks }) => (
            <article key={t.id} className="sheet sheet-plain stack" aria-label={`Theme ${t.name}`}>
              <div className="spread">
                <h3>{t.name}</h3>
                <span className="row">
                  <span className="chip chip-plain">{t.id}</span>
                  {t.active === false ? <span className="chip chip-warn">Chưa bật</span> : <span className="chip chip-good">Đang bật</span>}
                </span>
              </div>
              <p className="muted small">
                {THEME_GROUP_LABEL[t.group]} · {t.scheme === "dark" ? "tối" : "sáng"} · mở khóa: {unlockText(t.unlock)}
              </p>
              <div data-theme={t.id} className="gal-prev">
                <b>Chào bạn</b>
                <span className="muted">Chữ phụ trên nền thẻ</span>
                <span className="row">
                  <span className="btn btn-sm">Nút chính</span>
                  <span className="btn btn-sm btn-light">Nút phụ</span>
                  <span className="btn btn-sm btn-mark">Đánh dấu</span>
                  <span className="btn btn-sm btn-red">Nguy hiểm</span>
                </span>
                <span className="row">
                  <span className="chip">Chip</span>
                  <span className="chip chip-good">Đúng</span>
                  <span className="chip chip-red">Sai</span>
                  <span className="chip chip-warn">Cảnh báo</span>
                </span>
                <span className="bar bar-mark"><i style={{ width: "60%" }} /></span>
              </div>
              <Checks checks={checks} />
            </article>
          ))}
        </div>
      </section>

      <section className="stack" aria-labelledby="g-avatars">
        <h2 id="g-avatars">Avatar</h2>
        {avatars.length === 0 ? (
          <p className="muted">Chưa có avatar nào. Thêm bằng: <code>npm run new:avatar &lt;id&gt;</code>, rồi đặt ảnh 96.webp và 192.webp vào public/avatars/&lt;id&gt;/.</p>
        ) : (
          <div className="gal-grid">
            {avatars.map(({ a, checks }) => (
              <article key={a.id} className="sheet sheet-plain stack" aria-label={`Avatar ${a.name}`}>
                <div className="who-row"><Avatar avatar={a.id} username={a.name} /><div><h3>{a.name}</h3><p className="muted small">{a.series} · {unlockText(a.unlock)}{a.durationDays ? ` · ${a.durationDays} ngày` : " · vĩnh viễn"}</p></div></div>
                <Checks checks={checks} />
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="stack" aria-labelledby="g-frames">
        <h2 id="g-frames">Khung</h2>
        {frames.length === 0 ? (
          <p className="muted">Chưa có khung nào. Thêm bằng: <code>npm run new:frame &lt;id&gt;</code>.</p>
        ) : (
          <div className="gal-grid">
            {frames.map(({ f, checks }) => (
              <article key={f.id} className="sheet sheet-plain stack" aria-label={`Khung ${f.name}`}>
                <div className="who-row"><Avatar avatar={null} frame={f.id} username={f.name} /><div><h3>{f.name}</h3><p className="muted small">{RARITY_LABEL[f.rarity]} · {unlockText(f.unlock)}{f.durationDays ? ` · ${f.durationDays} ngày` : " · vĩnh viễn"}</p></div></div>
                <Checks checks={checks} />
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="stack" aria-labelledby="g-scenes">
        <h2 id="g-scenes">Scene đăng nhập</h2>
        <div className="gal-grid">
          {scenes.map(({ x, checks }) => (
            <article key={x.id} className="sheet sheet-plain stack" aria-label={`Scene ${x.name}`}>
              <div className="spread">
                <h3>{x.name}</h3>
                <span className="row">
                  <span className="chip chip-plain">{x.id}</span>
                  {x.active === false ? <span className="chip chip-warn">Chưa bật</span> : <span className="chip chip-good">Đang bật</span>}
                </span>
              </div>
              <p className="muted small">{x.canvas ? `Canvas: nhân vật ${x.canvas.mascot === "hang" ? "treo dây" : "đi bộ"}, công cụ ${x.canvas.toolLabel.toLowerCase()}` : "Chỉ bản tĩnh"}</p>
              <div
                className="gal-prev"
                style={{ background: `linear-gradient(160deg, ${x.tokens.stageBg}, ${x.tokens.stageBg2})`, color: x.tokens.stageText }}
              >
                <b>{x.greeting}</b>
                <span style={{ color: x.tokens.stageTextSoft }}>{x.tagline}</span>
                <span className="row" style={{ background: x.tokens.surface, color: x.tokens.text, padding: 10, borderRadius: 8, border: `2px solid ${x.tokens.accent}` }}>
                  <span style={{ background: x.tokens.accent, color: x.tokens.onAccent, padding: "6px 12px", borderRadius: 8, fontWeight: 700 }}>Đăng nhập</span>
                  <span style={{ color: x.tokens.accent }}>Quên mật khẩu?</span>
                </span>
              </div>
              <p className="small"><Link href={`/admin/scenes/${x.id}/preview`}>Xem trước đầy đủ</Link></p>
              <Checks checks={checks} />
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
