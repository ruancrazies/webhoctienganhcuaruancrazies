import type { SheetConfig } from "../../../content/schema/config";
import { TAB_COLUMNS } from "../../../content/schema/constants";
import type { Issue, Row, TabData } from "./types";

/**
 * Tab `reading` + `reading_questions` có cột riêng (title/cefr/type…, không có skill/kind). Hàm này chuyển chúng thành
 * dòng của tab `passages` / `passage_questions` (skill = reading) NGAY SAU KHI đọc Sheet, nên validate, sync, stats
 * dùng chung một luồng với bài đọc/nghe viết tay. Dòng giữ nguyên `tab` và số dòng gốc để báo lỗi đúng chỗ.
 *
 * - Tab không có (đọc từ --from-dir) hoặc sai cột (Google trả tab đầu tiên khi tên tab không tồn tại): bỏ qua, chỉ cảnh báo.
 * - mcq: `answer` là chữ của lựa chọn thì đổi thành số thứ tự (kể cả khi chữ toàn số như "1949"); nếu không thì để
 *   nguyên (validator hiểu là số thứ tự từ 1).
 * - tf: bỏ cột `options` (code không dùng).
 */
export function adaptReading(tabs: Map<string, TabData>, cfg: SheetConfig): Issue[] {
  const issues: Issue[] = [];
  const rName = cfg.otherTabs.reading.name;
  const qName = cfg.otherTabs.readingQuestions.name;
  const rTab = tabs.get(rName);
  const qTab = tabs.get(qName);

  /** Tab có đúng "dáng" của loại này không? (Tên tab không tồn tại → Google trả tab đầu tiên, cột sẽ khác hẳn.) */
  const shaped = (t: TabData | undefined, sig: string[]) => !!t && sig.every((c) => t.headers.includes(c));
  const columnsOk = (t: TabData, kind: "reading" | "readingQuestions"): boolean => {
    const spec = TAB_COLUMNS[kind];
    let ok = true;
    for (const c of spec.required) {
      if (!t.headers.includes(c)) {
        issues.push({ level: "error", tab: t.name, row: 1, code: "MISSING_COLUMN", msg: `Thiếu cột bắt buộc "${c}" (hoặc sai tên cột)` });
        ok = false;
      }
    }
    const allowed = new Set<string>([...spec.required, ...spec.optional]);
    for (const h of t.headers) {
      if (!allowed.has(h)) issues.push({ level: "warn", tab: t.name, row: 1, code: "EXTRA_COLUMN", msg: `Cột thừa "${h}" — bị bỏ qua khi nạp` });
    }
    return ok;
  };
  const skip = (t: TabData | undefined, name: string) => {
    if (t) {
      issues.push({
        level: "warn", tab: name, code: "READING_TAB_IGNORED",
        msg: `Tab "${name}" không đúng cột của bài đọc nên bị bỏ qua. Cột đọc được: ${t.headers.join(", ") || "(trống)"} — tab có tồn tại trên Sheet không? Nếu có, điền gid của tab vào sheet.config.json`,
      });
    }
  };

  const rShaped = shaped(rTab, ["title", "text"]);
  const qShaped = shaped(qTab, ["passage", "question"]);
  if (!rShaped) skip(rTab, rName);
  if (!qShaped) skip(qTab, qName);
  const rOk = rShaped && columnsOk(rTab!, "reading");
  const qOk = qShaped && columnsOk(qTab!, "readingQuestions");

  const ensure = (name: string, kind: "passages" | "passageQuestions"): TabData => {
    let t = tabs.get(name);
    if (!t) {
      t = { name, headers: [...TAB_COLUMNS[kind].required, ...TAB_COLUMNS[kind].optional], rows: [], lastRow: 1 };
      tabs.set(name, t);
    }
    return t;
  };

  if (rOk) {
    const target = ensure(cfg.otherTabs.passages.name, "passages");
    for (const r of rTab!.rows) {
      const { key, title, cefr, text, topic, source, license, note } = r.v;
      const src = [source, license && !source?.includes(license) ? license : ""].filter(Boolean).join(" — ");
      target.rows.push({
        tab: r.tab, row: r.row,
        v: { key, skill: "reading", level: cefr, title, text, topic: topic ?? "", audio: "", source: src, note: note ?? "" },
      } satisfies Row);
    }
  }

  if (qOk) {
    const target = ensure(cfg.otherTabs.passageQuestions.name, "passageQuestions");
    for (const r of qTab!.rows) {
      const { key, passage, type, question, options, answer, explanation, note } = r.v;
      const kind = (type ?? "").toLowerCase();
      let ans = answer ?? "";
      if (kind === "mcq" && ans) {
        const opts = (options ?? "").split("|").map((x) => x.trim()).filter(Boolean);
        const at = opts.indexOf(ans);
        if (at >= 0) {
          if (/^\d+$/.test(ans) && Number(ans) !== at + 1 && Number(ans) >= 1 && Number(ans) <= opts.length) {
            issues.push({
              level: "warn", tab: r.tab, row: r.row, code: "AMBIGUOUS_ANSWER",
              msg: `answer "${ans}" vừa là chữ của lựa chọn ${at + 1} vừa là số thứ tự ${ans} — đang hiểu là chữ (lựa chọn ${at + 1}); nếu muốn lựa chọn ${ans}, đổi answer thành đúng chữ của lựa chọn đó`,
            });
          }
          ans = String(at + 1);
        }
      }
      target.rows.push({
        tab: r.tab, row: r.row,
        v: { key, passage, kind, question, options: kind === "tf" ? "" : options ?? "", answer: ans, explanation: explanation ?? "", note: note ?? "" },
      } satisfies Row);
    }
  }
  return issues;
}
