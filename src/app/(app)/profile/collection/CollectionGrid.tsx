"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import type { CosmeticKind } from "@/core/cosmetics";
import { DEFAULT_THEME_ID } from "@/cosmetics/core/constants";
import { applyServerTheme } from "@/lib/theme";
import { equipCosmeticAction } from "../actions";

/** Mọi chữ đã được server dựng sẵn (giờ Việt Nam, số XP còn thiếu…): client chỉ hiển thị và gọi server. */
export type GridItem = {
  id: string;
  name: string;
  /** Nhãn chữ phân biệt bậc hiếm (không chỉ bằng màu). */
  rarity: string | null;
  /** Nhóm theme / bộ sưu tập avatar. */
  tag: string | null;
  isNew: boolean;
  equipped: boolean;
  usable: boolean;
  /** "Còn 3 ngày" / "Hết hạn 12/12" (chữ, không chỉ màu). */
  expiry: string | null;
  expired: boolean;
  /** Điều kiện / tình trạng, đọc được bằng screen reader. */
  status: string;
  /** 0..1 cho món khóa theo level; null nếu không có thanh tiến độ. */
  progress: number | null;
  /** Liên kết tới nơi nhận món (vd sự kiện đang diễn ra). */
  link: { href: string; label: string } | null;
  art: ReactNode;
};

const KIND_LABEL: Record<CosmeticKind, { use: string; reset: string }> = {
  theme: { use: "giao diện", reset: "" },
  avatar: { use: "avatar", reset: "Bỏ avatar (dùng chữ cái đầu)" },
  frame: { use: "khung", reset: "Bỏ khung" },
};

export function CollectionGrid({ kind, items, canReset }: { kind: CosmeticKind; items: GridItem[]; canReset: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const saved = useRef<string | null>(null); // theme đang lưu, để quay lại khi hết dùng thử
  const msgId = useId();

  const stopPreview = (restore: boolean) => {
    if (saved.current !== null && restore) document.documentElement.dataset.theme = saved.current;
    saved.current = null;
    setPreview(null);
  };
  // Rời trang mà đang dùng thử thì trả lại giao diện đang lưu.
  useEffect(() => () => {
    if (saved.current !== null) document.documentElement.dataset.theme = saved.current;
  }, []);

  const startPreview = (id: string) => {
    if (saved.current === null) saved.current = document.documentElement.dataset.theme ?? DEFAULT_THEME_ID;
    document.documentElement.dataset.theme = id;
    setPreview(id);
    setMsg(null);
  };

  const equip = (item: GridItem | null) =>
    start(async () => {
      const r = await equipCosmeticAction({ kind, id: item?.id ?? null });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      if (kind === "theme" && item) {
        stopPreview(false); // đã lưu: không quay lại bản cũ
        applyServerTheme(item.id); // server đã ghi cookie; áp ngay để không chờ vẽ lại
      }
      setMsg({ ok: true, text: item ? `Đã dùng “${item.name}”.` : kind === "avatar" ? "Đã bỏ avatar." : "Đã bỏ khung." });
    });

  const previewing = preview ? items.find((i) => i.id === preview) : undefined;

  return (
    <div className="stack">
      <p id={msgId} className={msg && !msg.ok ? "err" : "small"} role="status" aria-live="polite">{msg?.text ?? ""}</p>

      {canReset && kind !== "theme" ? (
        <div>
          <button type="button" className="btn btn-light btn-sm" disabled={pending} onClick={() => equip(null)}>{KIND_LABEL[kind].reset}</button>
        </div>
      ) : null}

      <ul className="cos-grid">
        {items.map((it) => (
          <Card key={it.id} item={it} kind={kind} pending={pending} previewing={preview === it.id} onUse={() => equip(it)} onPreview={() => (preview === it.id ? stopPreview(true) : startPreview(it.id))} />
        ))}
      </ul>

      {previewing ? (
        <div className="cos-previewbar" role="group" aria-label="Đang dùng thử giao diện">
          <span><b>Đang dùng thử “{previewing.name}”</b><span className="small"> · chưa lưu</span></span>
          <span className="row">
            <button type="button" className="btn btn-sm" disabled={pending || !previewing.usable} aria-disabled={!previewing.usable || undefined} onClick={() => previewing.usable && equip(previewing)}>
              {previewing.usable ? "Dùng giao diện này" : "Chưa mở khóa"}
            </button>
            <button type="button" className="btn btn-light btn-sm" onClick={() => stopPreview(true)}>Thôi, quay lại</button>
          </span>
        </div>
      ) : null}
    </div>
  );
}

function Card({ item, kind, pending, previewing, onUse, onPreview }: { item: GridItem; kind: CosmeticKind; pending: boolean; previewing: boolean; onUse: () => void; onPreview: () => void }) {
  const sid = useId();
  const locked = !item.usable;
  return (
    <li className="cos-card" data-state={item.equipped ? "equipped" : locked ? "locked" : "owned"} aria-labelledby={`${sid}-n`}>
      <div className={`cos-art${locked ? " is-locked" : ""}`}>{item.art}</div>
      <div className="cos-body">
        <h3 id={`${sid}-n`} className="cos-name">{item.name}</h3>
        <p className="cos-chips">
          {item.equipped ? <span className="chip chip-good"><Icon name="check" size={14} /> Đang dùng</span> : null}
          {item.isNew ? <span className="chip chip-mark">Mới</span> : null}
          {item.rarity ? <span className="chip chip-plain">{item.rarity}</span> : null}
          {item.tag ? <span className="chip chip-plain">{item.tag}</span> : null}
          {item.expiry ? <span className={`chip ${item.expired ? "chip-red" : "chip-warn"}`}>{item.expiry}</span> : null}
        </p>
        <p id={`${sid}-s`} className="small muted cos-status">
          {locked && !item.expired ? <Icon name="lock" size={14} /> : null} {item.status}
        </p>
        {item.progress !== null ? (
          <div className="bar bar-mark" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.progress * 100)} aria-label={`Tiến độ mở khóa ${item.name}`}>
            <i style={{ width: `${item.progress * 100}%` }} />
          </div>
        ) : null}
        {item.link ? <p className="small"><Link href={item.link.href}>{item.link.label}</Link></p> : null}
        <div className="cos-actions">
          {kind === "theme" ? (
            <button type="button" className="btn btn-light btn-sm" aria-pressed={previewing} onClick={onPreview} aria-describedby={`${sid}-s`}>
              {previewing ? "Đang dùng thử" : "Dùng thử"}
            </button>
          ) : null}
          {item.equipped ? null : (
            // Món khóa/hết hạn dùng aria-disabled (không phải disabled) để bàn phím vẫn tới được và đọc được lý do ở dòng trạng thái.
            <button type="button" className="btn btn-sm" disabled={pending} aria-disabled={locked || undefined} aria-describedby={`${sid}-s`} onClick={() => !locked && onUse()}>
              {locked ? (item.expired ? "Đã hết hạn" : "Chưa mở khóa") : "Dùng"}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
