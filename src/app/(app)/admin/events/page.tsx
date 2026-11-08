import Link from "next/link";
import { DEFAULT_CLAIM_DAYS, MAX_CLAIM_DAYS, MAX_EVENT_DAYS, PHASE_LABEL, datesOfWindow, fmtVnDate } from "@/core/seasonEvents";
import { listAdminEvents } from "@/server/services";
import { ActionForm, SubmitButton } from "../scenes/ActionForm";
import { createEventAction } from "./actions";
import { PHASE_CHIP } from "./phase";

export const metadata = { title: "Sự kiện · Quản trị" };
export const dynamic = "force-dynamic";


export default async function EventsAdminPage() {
  const rows = await listAdminEvents();
  return (
    <main className="page page-narrow">
      <Link href="/admin" className="back">‹ Quản trị</Link>
      <header className="stack" style={{ gap: 6 }}>
        <h1>Sự kiện theo mùa</h1>
        <p className="muted">Mỗi đợt là một lần chạy riêng (giang-sinh-2026, giang-sinh-2027…): có lịch, nhiệm vụ và phần thưởng (XP, avatar, khung, giao diện có hạn dùng). Muốn chạy lại, hãy nhân bản đợt cũ.</p>
      </header>

      <section className="stack" aria-label="Danh sách sự kiện">
        {rows.length === 0 ? <p className="muted">Chưa có sự kiện nào.</p> : null}
        {rows.map(({ event: e, phase, taskCount, stat }) => {
          const d = datesOfWindow(e);
          return (
            <article key={e.key} className="sheet sheet-plain stack" aria-labelledby={`ev-${e.key}`}>
              <div className="spread">
                <h2 id={`ev-${e.key}`}>{e.name}</h2>
                <span className={PHASE_CHIP[phase]}>{PHASE_LABEL[phase]}</span>
              </div>
              <p className="muted small">
                <code>{e.key}</code> · {fmtVnDate(`${d.startsOn}T12:00:00+07:00`)} – {fmtVnDate(`${d.endsOn}T12:00:00+07:00`)} (giờ Việt Nam) · {taskCount} nhiệm vụ
                {stat.participants > 0 ? ` · ${stat.participants} người tham gia, ${stat.claims} lượt nhận thưởng` : ""}
              </p>
              <div><Link href={`/admin/events/${e.key}`} className="btn btn-sm">Quản lý</Link></div>
            </article>
          );
        })}
      </section>

      <section className="sheet stack" aria-labelledby="ev-new">
        <h2 id="ev-new">Tạo sự kiện</h2>
        <ActionForm action={createEventAction}>
          <div className="field"><label htmlFor="key">Mã</label><input id="key" name="key" required maxLength={32} pattern="[a-z][a-z0-9\-]{1,31}" placeholder="giang-sinh-2026" /><small className="hint">Chữ thường, số, gạch ngang. Không đổi được sau này.</small></div>
          <div className="field"><label htmlFor="name">Tên hiển thị</label><input id="name" name="name" required maxLength={80} placeholder="Giáng sinh 2026" /></div>
          <div className="field"><label htmlFor="blurb">Mô tả ngắn (tuỳ chọn)</label><input id="blurb" name="blurb" maxLength={240} /></div>
          <div className="row">
            <div className="field"><label htmlFor="startsOn">Từ ngày</label><input id="startsOn" name="startsOn" type="date" required /></div>
            <div className="field"><label htmlFor="endsOn">Đến hết ngày</label><input id="endsOn" name="endsOn" type="date" required /></div>
            <div className="field"><label htmlFor="claimDays">Nhận thưởng thêm (ngày)</label><input id="claimDays" name="claimDays" type="number" min={0} max={MAX_CLAIM_DAYS} defaultValue={DEFAULT_CLAIM_DAYS} inputMode="numeric" /></div>
          </div>
          <small className="hint">Giờ Việt Nam. Tối đa {MAX_EVENT_DAYS} ngày. Sau khi hết giờ làm, người chơi còn nhận được thưởng của nhiệm vụ đã xong trong số ngày trên.</small>
          <div><SubmitButton>Tạo (nháp)</SubmitButton></div>
        </ActionForm>
      </section>
    </main>
  );
}
