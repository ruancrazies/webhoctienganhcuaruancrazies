import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { EventCard } from "@/components/EventQuests";
import {
  MAX_CLAIM_DAYS, MAX_TASKS_PER_EVENT, METRIC_LABEL, EVENT_METRICS, PHASE_LABEL, canDo, claimEndsAt, datesOfWindow, fmtVnDate, phaseCountdownText, rewardText, taskTitle,
} from "@/core/seasonEvents";
import { RARITY_LABEL } from "@/cosmetics/core/define";
import { getAdminEvent } from "@/server/services";
import { ActionForm, SubmitButton } from "../../scenes/ActionForm";
import { PHASE_CHIP } from "../phase";
import { addTaskAction, deleteTaskAction, duplicateEventAction, eventOpAction, saveEventAction } from "../actions";

export const dynamic = "force-dynamic";

const KIND = { theme: "Giao diện", avatar: "Avatar", frame: "Khung" } as const;
const OPS = [
  { op: "publish", label: "Xuất bản", note: "Người chơi thấy sự kiện theo lịch (sắp mở hiện trước 14 ngày).", cls: "btn btn-sm" },
  { op: "unpublish", label: "Đưa về nháp", note: "Chỉ khi chưa bắt đầu.", cls: "btn btn-sm btn-light" },
  { op: "end", label: "Kết thúc sớm", note: "Dừng ghi tiến độ ngay; vẫn cho nhận thưởng trong thời gian nhận thưởng.", cls: "btn btn-sm btn-light" },
  { op: "delete", label: "Xóa nháp", note: "Chỉ xóa được nháp.", cls: "btn btn-sm btn-light" },
] as const;

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  return { title: `${(await params).key} · Sự kiện · Quản trị` };
}

export default async function EventDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const v = await getAdminEvent(key);
  if (!v) notFound();
  const { event: e, phase, tasks, preview, check, stat, options } = v;
  const now = new Date();
  const d = datesOfWindow(e);
  const day = (iso: string) => fmtVnDate(`${iso}T12:00:00+07:00`);
  const locked = e.status === "published";

  // Xem trước đúng thứ người chơi sẽ thấy: nháp cũng dựng như "đang diễn ra", tiến độ 0, không gọi server.
  const previewPhase = phase === "scheduled" || phase === "claiming" ? phase : "running";
  const art: Record<string, React.ReactNode> = {};
  for (const t of preview) if (t.reward?.kind === "frame") art[t.reward.id] = <Avatar avatar={null} frame={t.reward.id} username={e.name} size="sm" />;
  else if (t.reward?.kind === "avatar") art[t.reward.id] = <Avatar avatar={t.reward.id} username={e.name} size="sm" />;

  return (
    <main className="page page-narrow">
      <Link href="/admin/events" className="back">‹ Sự kiện</Link>
      <header className="stack" style={{ gap: 6 }}>
        <div className="spread"><h1>{e.name}</h1><span className={PHASE_CHIP[phase]}>{PHASE_LABEL[phase]}</span></div>
        <p className="muted"><code>{e.key}</code> · {day(d.startsOn)} – {day(d.endsOn)} · nhận thưởng tới {fmtVnDate(new Date(claimEndsAt(e).getTime() - 1))}{phaseCountdownText(e, phase, now) ? ` · ${phaseCountdownText(e, phase, now)}` : ""}</p>
        {stat.participants > 0 ? <p className="small">{stat.participants} người tham gia · {stat.claims} lượt nhận thưởng</p> : null}
      </header>

      <section className="sheet stack" aria-labelledby="s-check">
        <h2 id="s-check">Kiểm tra trước khi xuất bản</h2>
        {check.errors.length === 0 && check.warnings.length === 0 ? <p className="gate gate-ok">Không có vấn đề.</p> : null}
        {check.errors.length ? <ul className="weak-list">{check.errors.map((m) => <li key={m}><span><b>Lỗi:</b> {m}</span></li>)}</ul> : null}
        {check.warnings.length ? <ul className="weak-list">{check.warnings.map((m) => <li key={m}><span><b>Lưu ý:</b> {m}</span></li>)}</ul> : null}
      </section>

      <section className="sheet stack" aria-labelledby="s-op">
        <h2 id="s-op">Trạng thái</h2>
        <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {OPS.filter((o) => canDo(o.op, phase)).map((o) => (
            <li key={o.op}>
              <ActionForm action={eventOpAction} className="row">
                <input type="hidden" name="key" value={e.key} />
                <input type="hidden" name="op" value={o.op} />
                <SubmitButton className={o.cls}>{o.label}</SubmitButton>
                <span className="muted small">{o.note}</span>
              </ActionForm>
            </li>
          ))}
          {OPS.every((o) => !canDo(o.op, phase)) ? <li className="muted">Không còn thao tác trạng thái nào ở giai đoạn này. Muốn chạy lại, nhân bản ở cuối trang.</li> : null}
        </ul>
      </section>

      <section className="sheet stack" aria-labelledby="s-info">
        <h2 id="s-info">Thông tin và lịch (giờ Việt Nam)</h2>
        <p className="muted small">
          {phase === "draft" || phase === "scheduled" ? "Chưa bắt đầu: sửa được mọi thứ." : phase === "running" ? "Đang diễn ra: ngày bắt đầu đã khóa; ngày kết thúc phải còn ở phía trước." : "Đã hết giờ làm: lịch khóa, chỉ sửa được chữ."}
        </p>
        <ActionForm action={saveEventAction}>
          <input type="hidden" name="key" value={e.key} />
          <div className="field"><label htmlFor="name">Tên hiển thị</label><input id="name" name="name" required maxLength={80} defaultValue={e.name} /></div>
          <div className="field"><label htmlFor="blurb">Mô tả ngắn</label><input id="blurb" name="blurb" maxLength={240} defaultValue={e.blurb ?? ""} /></div>
          <div className="row">
            <div className="field"><label htmlFor="startsOn">Từ ngày</label><input id="startsOn" name="startsOn" type="date" required defaultValue={d.startsOn} /></div>
            <div className="field"><label htmlFor="endsOn">Đến hết ngày</label><input id="endsOn" name="endsOn" type="date" required defaultValue={d.endsOn} /></div>
            <div className="field"><label htmlFor="claimDays">Nhận thưởng thêm (ngày)</label><input id="claimDays" name="claimDays" type="number" min={0} max={MAX_CLAIM_DAYS} defaultValue={e.claimDays} inputMode="numeric" /></div>
          </div>
          <div><SubmitButton>Lưu</SubmitButton></div>
        </ActionForm>
      </section>

      <section className="sheet stack" aria-labelledby="s-tasks">
        <h2 id="s-tasks">Nhiệm vụ và phần thưởng ({tasks.length}/{MAX_TASKS_PER_EVENT})</h2>
        {tasks.length ? (
          <ul className="weak-list">
            {tasks.map((t, i) => {
              const pv = preview[i]!;
              return (
                <li key={t.id}>
                  <span>
                    <b>{taskTitle({ ...t, target: pv.target })}</b> <span className="muted small">· {METRIC_LABEL[t.metric]}</span>
                    <br /><span className="muted small">Thưởng: {rewardText(pv, (r) => RARITY_LABEL[r], (k) => KIND[k]) || "—"}</span>
                  </span>
                  {locked ? null : (
                    <ActionForm action={deleteTaskAction} className="row">
                      <input type="hidden" name="key" value={e.key} />
                      <input type="hidden" name="id" value={t.id} />
                      <SubmitButton className="btn btn-sm btn-light">Xóa<span className="sr-only"> nhiệm vụ {pv.title}</span></SubmitButton>
                    </ActionForm>
                  )}
                </li>
              );
            })}
          </ul>
        ) : <p className="muted small">Chưa có nhiệm vụ.</p>}

        {locked ? (
          <p className="muted small">Sự kiện đã xuất bản nên khóa nhiệm vụ (để không đổi luật khi người chơi đang làm). Cần sửa: nhân bản sang đợt mới.</p>
        ) : (
          <>
            <h3>Thêm nhiệm vụ</h3>
            <ActionForm action={addTaskAction}>
              <input type="hidden" name="key" value={e.key} />
              <div className="row">
                <div className="field"><label htmlFor="metric">Loại</label>
                  <select id="metric" name="metric" className="select" defaultValue="learn">{EVENT_METRICS.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}</select></div>
                <div className="field"><label htmlFor="target">Mục tiêu</label><input id="target" name="target" type="number" min={1} defaultValue={10} inputMode="numeric" /><small className="hint">Bỏ qua với “Hoàn thành tất cả” (tự tính).</small></div>
                <div className="field"><label htmlFor="rewardXp">Thưởng XP</label><input id="rewardXp" name="rewardXp" type="number" min={0} defaultValue={0} inputMode="numeric" /></div>
              </div>
              <div className="field"><label htmlFor="rewardCosmetic">Thưởng món (tuỳ chọn)</label>
                <select id="rewardCosmetic" name="rewardCosmetic" className="select" defaultValue="">
                  <option value="">Không</option>
                  {options.map((o) => <option key={o.id} value={o.id}>{KIND[o.kind]}: {o.label}{o.synced ? "" : " (chưa đồng bộ)"}{o.active ? "" : " (đang tắt)"}</option>)}
                </select>
                <small className="hint">Hạn dùng của món lấy từ cấu hình món (duration_days). Mỗi nhiệm vụ cần ít nhất XP hoặc một món.</small></div>
              <div className="field"><label htmlFor="title">Tên riêng (tuỳ chọn)</label><input id="title" name="title" maxLength={80} placeholder="Để trống = tên mặc định theo loại" /></div>
              <div><SubmitButton>Thêm nhiệm vụ</SubmitButton></div>
            </ActionForm>
          </>
        )}
      </section>

      <section className="stack" aria-labelledby="s-prev">
        <h2 id="s-prev">Người chơi sẽ thấy</h2>
        {preview.length ? <EventCard ev={{ key: e.key, name: e.name, blurb: e.blurb, phase: previewPhase, countdown: phaseCountdownText(e, previewPhase, previewPhase === "scheduled" ? new Date(new Date(e.startsAt).getTime() - 86_400_000) : phase === "draft" ? new Date(new Date(e.startsAt).getTime() + 1) : now) || "Còn —", lastDay: day(d.endsOn).slice(0, 5), tasks: preview, art }} preview /> : <p className="muted">Thêm nhiệm vụ để xem trước.</p>}
        <p className="muted small">Bản xem trước không gọi server; tiến độ luôn là 0.</p>
      </section>

      <section className="sheet stack" aria-labelledby="s-dup">
        <h2 id="s-dup">Nhân bản (chạy lại / sang năm)</h2>
        <p className="muted">Sao nhiệm vụ và phần thưởng sang một đợt NHÁP mới với lịch mới. Tiến độ cũ không dính sang; người đã hết hạn món sẽ nhận lại được và hạn dùng tính lại từ ngày nhận. Nhớ kiểm tra luật “sự kiện” của món thưởng nếu mã đợt mới khác.</p>
        <ActionForm action={duplicateEventAction}>
          <input type="hidden" name="key" value={e.key} />
          <div className="field"><label htmlFor="newKey">Mã đợt mới</label><input id="newKey" name="newKey" required maxLength={32} pattern="[a-z][a-z0-9\-]{1,31}" placeholder={`${e.key.replace(/\d{4}$/, "")}${new Date().getFullYear() + 1}`} /></div>
          <div className="row">
            <div className="field"><label htmlFor="dupStarts">Từ ngày</label><input id="dupStarts" name="startsOn" type="date" required /></div>
            <div className="field"><label htmlFor="dupEnds">Đến hết ngày</label><input id="dupEnds" name="endsOn" type="date" required /></div>
          </div>
          <div><SubmitButton>Nhân bản</SubmitButton></div>
        </ActionForm>
      </section>
    </main>
  );
}
