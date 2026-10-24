import { createAdminClient } from "../db";
import { RepoError } from "../errors";
import type { Cefr, StoredItem } from "../../core/types";
import { unwrap, unwrapList } from "./shared";

const db = () => createAdminClient();

export type ExamRow = {
  id: string;
  cefr: Cefr;
  items: StoredItem[];
  startedAt: Date;
  expiresAt: Date;
  finishedAt: Date | null;
};

type Raw = { id: string; cefr: Cefr; items: StoredItem[]; started_at: string; expires_at: string; finished_at: string | null };
const COLS = "id,cefr,items,started_at,expires_at,finished_at";

const toExam = (r: Raw): ExamRow => ({
  id: r.id,
  cefr: r.cefr,
  items: r.items,
  startedAt: new Date(r.started_at),
  expiresAt: new Date(r.expires_at),
  finishedAt: r.finished_at ? new Date(r.finished_at) : null,
});

/** Bài đang dở (finished_at IS NULL) — tối đa một bài/người nhờ unique partial index. */
export async function activeExam(userId: string): Promise<ExamRow | null> {
  const r = unwrap<Raw>("exams.active", await db().from("level_exams").select(COLS).eq("user_id", userId).is("finished_at", null).limit(1).maybeSingle());
  return r ? toExam(r) : null;
}

export async function getExam(examId: string, userId: string): Promise<ExamRow | null> {
  const r = unwrap<Raw>("exams.get", await db().from("level_exams").select(COLS).eq("id", examId).eq("user_id", userId).maybeSingle());
  return r ? toExam(r) : null;
}

/** started_at của mọi lượt thi (mọi cấp) kể từ `since` — tối đa 20 dòng đủ để đếm lượt/ngày. */
export async function examStartTimes(userId: string, since: Date): Promise<Date[]> {
  const rows = unwrapList<{ started_at: string }>(
    "exams.startTimes",
    await db().from("level_exams").select("started_at").eq("user_id", userId).gte("started_at", since.toISOString()).order("started_at", { ascending: false }).limit(20),
  );
  return rows.map((r) => new Date(r.started_at));
}

/** Thời điểm kết thúc của lượt TRƯỢT gần nhất của đúng cấp (kể cả lượt hết giờ: finished_at = expires_at). */
export async function lastFailedExamEnd(userId: string, cefr: Cefr): Promise<Date | null> {
  const r = unwrap<{ finished_at: string }>(
    "exams.lastFail",
    await db().from("level_exams").select("finished_at").eq("user_id", userId).eq("cefr", cefr).eq("passed", false).not("finished_at", "is", null).order("finished_at", { ascending: false }).limit(1).maybeSingle(),
  );
  return r ? new Date(r.finished_at) : null;
}

/** Id các từ có trong lượt thi gần nhất của cấp này (để đề lần sau không lặp). */
export async function lastExamWordIds(userId: string, cefr: Cefr): Promise<Set<number>> {
  const r = unwrap<{ items: StoredItem[] }>(
    "exams.lastItems",
    await db().from("level_exams").select("items").eq("user_id", userId).eq("cefr", cefr).order("started_at", { ascending: false }).limit(1).maybeSingle(),
  );
  const ids = (r?.items ?? []).map((i) => i.wordId).filter((x): x is number => typeof x === "number");
  return new Set(ids);
}

/**
 * Tạo bài thi. Hai request song song: unique partial index khiến request thứ hai ném RepoError code "23505"
 * — service bắt và trả lại bài vừa được tạo.
 */
export async function createExam(userId: string, cefr: Cefr, items: StoredItem[], expiresAt: Date): Promise<ExamRow> {
  const r = unwrap<Raw>(
    "exams.create",
    await db().from("level_exams").insert({ user_id: userId, cefr, items, expires_at: expiresAt.toISOString() }).select(COLS).single(),
  );
  if (!r) throw new RepoError("exams.create", "không có dòng trả về");
  return toExam(r);
}

/** RPC fail_exam: hết giờ chưa nộp = trượt, điểm 0. Trả true nếu thực sự đóng được bài. */
export async function failExam(userId: string, examId: string): Promise<boolean> {
  const { data, error } = await db().rpc("fail_exam", { p_user: userId, p_exam: examId });
  if (error) throw new RepoError("rpc.fail_exam", error.message, error.code);
  return data === true;
}

export type ExamPayload = { passed: boolean; total: number; vocab: number; grammar: number; today: number };

/** RPC apply_exam_result: đóng bài + (đạt) ghi level_passes + chuỗi ngày, MỘT giao dịch. Không đụng XP/SRS. */
export async function applyExamResult(userId: string, examId: string, payload: ExamPayload): Promise<{ streak: number; cefr: Cefr; passed: boolean }> {
  const { data, error } = await db().rpc("apply_exam_result", { p_user: userId, p_exam: examId, p_payload: payload });
  if (error) throw new RepoError("rpc.apply_exam_result", error.message, error.code);
  return data as { streak: number; cefr: Cefr; passed: boolean };
}
