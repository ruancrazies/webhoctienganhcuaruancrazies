import { createAdminClient } from "../db";
import { RepoError } from "../errors";
import type { ExamPoint, InsightEvent, InsightRound, InsightSession } from "../../core/insights";
import type { Cefr } from "../../core/types";
import { unwrap, unwrapList } from "./shared";

const db = () => createAdminClient();

/** PostgREST trả tối đa 1000 dòng mỗi yêu cầu (mặc định của Supabase): đọc nhiều dòng phải phân trang bằng range. */
const PAGE = 1000;
/** Trần số dòng sự kiện đọc cho một lần tính hồ sơ: ~5.000 câu gần nhất (đủ cho 60 ngày ở mức ~80 câu/ngày; trọng số giảm dần theo thời gian nên phần cắt đi ít ảnh hưởng). */
export const INSIGHT_MAX_EVENTS = 5 * PAGE;
export const INSIGHT_MAX_ROUNDS = 2 * PAGE;
export const INSIGHT_MAX_ACTIVITY = 5 * PAGE;

type Num = number | string | null;
const num = (v: Num): number | null => (v === null ? null : Number(v));

/** Đọc `pages` trang song song (khi trang đầy thì mới có ý nghĩa; trang thừa trả mảng rỗng, rất rẻ). Thứ tự truy vấn phải ổn định (order có tie-break). */
async function readPages<T>(op: string, pages: number, page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>): Promise<T[]> {
  const results = await Promise.all(Array.from({ length: pages }, (_, i) => page(i * PAGE, i * PAGE + PAGE - 1)));
  return results.flatMap((r) => unwrapList<T>(op, r));
}

// ---------- hồ sơ đã lưu ----------

export type StoredInsights = { data: unknown; updatedAt: Date };

export async function getUserInsights(userId: string): Promise<StoredInsights | null> {
  const r = unwrap<{ data: unknown; updated_at: string }>("insights.get", await db().from("user_insights").select("data,updated_at").eq("user_id", userId).maybeSingle());
  return r ? { data: r.data, updatedAt: new Date(r.updated_at) } : null;
}

export async function saveUserInsights(userId: string, data: unknown, now: Date): Promise<void> {
  const { error } = await db().from("user_insights").upsert({ user_id: userId, data, updated_at: now.toISOString() }, { onConflict: "user_id" });
  if (error) throw new RepoError("insights.save", error.message, error.code);
}

// ---------- đầu vào của computeInsights ----------

type EventRow = {
  game: string; part: string; correct: boolean; hint_used: boolean; response_ms: number | null; answered_at: string;
  cefr: string | null; pos: string | null; domain: string | null; grammar_topic: string | null;
};

/** Câu đã trả lời từ `since`, mới nhất trước, tối đa INSIGHT_MAX_EVENTS. Index (user_id, answered_at desc). KHÔNG đọc answer_value/expected. */
export async function recentAnswerEvents(userId: string, since: Date): Promise<InsightEvent[]> {
  const rows = await readPages<EventRow>("insights.events", INSIGHT_MAX_EVENTS / PAGE, (from, to) =>
    db()
      .from("answer_events")
      .select("game,part,correct,hint_used,response_ms,answered_at,cefr,pos,domain,grammar_topic")
      .eq("user_id", userId)
      .gte("answered_at", since.toISOString())
      .order("answered_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
  return rows.map((r) => ({
    game: r.game,
    part: r.part,
    correct: r.correct,
    hintUsed: r.hint_used,
    responseMs: r.response_ms,
    at: new Date(r.answered_at),
    cefr: (r.cefr as Cefr | null) ?? null,
    pos: r.pos,
    domain: r.domain,
    grammarTopic: r.grammar_topic,
  }));
}

/** Vòng chơi từ `since`: chỉ game và thời điểm mở/nộp. KHÔNG đọc `items` (đề + đáp án). Index (user_id, created_at desc). */
export async function recentRounds(userId: string, since: Date): Promise<InsightRound[]> {
  const rows = await readPages<{ game: string; created_at: string; finished_at: string | null }>("insights.rounds", INSIGHT_MAX_ROUNDS / PAGE, (from, to) =>
    db()
      .from("game_rounds")
      .select("game,created_at,finished_at")
      .eq("user_id", userId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
  return rows.map((r) => ({ game: r.game, createdAt: new Date(r.created_at), finishedAt: r.finished_at ? new Date(r.finished_at) : null }));
}

/** Phiên học từ `since`: gộp activity_events theo session_id (sự kiện không có phiên bị bỏ qua). */
export async function recentSessions(userId: string, since: Date): Promise<InsightSession[]> {
  const rows = await readPages<{ session_id: string | null; at: string }>("insights.sessions", INSIGHT_MAX_ACTIVITY / PAGE, (from, to) =>
    db()
      .from("activity_events")
      .select("session_id,at")
      .eq("user_id", userId)
      .gte("at", since.toISOString())
      .order("at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
  const by = new Map<string, { start: number; end: number; events: number }>();
  for (const r of rows) {
    if (!r.session_id) continue;
    const t = new Date(r.at).getTime();
    const s = by.get(r.session_id);
    if (!s) by.set(r.session_id, { start: t, end: t, events: 1 });
    else {
      s.start = Math.min(s.start, t);
      s.end = Math.max(s.end, t);
      s.events++;
    }
  }
  return [...by.values()].map((s) => ({ start: new Date(s.start), end: new Date(s.end), events: s.events }));
}

type ScoreRaw = { finished_at: string; score_total: Num; score_vocab: Num; score_grammar: Num; score_reading: Num; score_listening: Num };
const SCORE_COLS = "finished_at,score_total,score_vocab,score_grammar,score_reading,score_listening";

/** Hai bài đã nộp gần nhất của MỖI loại (thi lên cấp, kiểm tra) có điểm; computeInsights chọn hai bài gần nhất trong số đó. Bài hết giờ không có điểm nên không vào. */
export async function recentExamPoints(userId: string): Promise<ExamPoint[]> {
  const [exams, practices] = await Promise.all([
    db().from("level_exams").select(`cefr,passed,${SCORE_COLS}`).eq("user_id", userId).not("finished_at", "is", null).not("score_total", "is", null).order("finished_at", { ascending: false }).limit(2),
    db().from("practice_tests").select(SCORE_COLS).eq("user_id", userId).not("finished_at", "is", null).not("score_total", "is", null).order("finished_at", { ascending: false }).limit(2),
  ]);
  const point = (r: ScoreRaw, kind: ExamPoint["kind"], cefr: Cefr | null, passed: boolean | null): ExamPoint => ({
    at: new Date(r.finished_at), kind, cefr, passed,
    total: Number(r.score_total), vocab: Number(r.score_vocab), grammar: Number(r.score_grammar), reading: num(r.score_reading), listening: num(r.score_listening),
  });
  return [
    ...unwrapList<ScoreRaw & { cefr: Cefr; passed: boolean | null }>("insights.exams", exams).map((r) => point(r, "exam", r.cefr, r.passed)),
    ...unwrapList<ScoreRaw>("insights.practices", practices).map((r) => point(r, "practice", null, null)),
  ];
}

/** Số từ quá hạn ôn hơn 2 ngày. (Số từ đến hạn: dueCount ở repo/progress.) */
export async function overdueCount(userId: string, now: Date, days = 2): Promise<number> {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const { count, error } = await db()
    .from("user_word_progress")
    .select("word_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .lte("next_review", cutoff.toISOString());
  if (error) throw new RepoError("insights.overdue", error.message, error.code);
  return count ?? 0;
}

/** Trung vị response_ms toàn hệ thống theo game (RPC game_response_medians). */
export async function gameResponseMedians(days = 90): Promise<Record<string, number>> {
  const { data, error } = await db().rpc("game_response_medians", { p_days: days });
  if (error) throw new RepoError("rpc.game_response_medians", error.message, error.code);
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { game: string; median_ms: number }[]) out[r.game] = Number(r.median_ms);
  return out;
}

// ---------- hoạt động ----------

/** RPC record_activity: ghi một sự kiện hoạt động, trả session_id (phiên tính phía server). */
export async function recordActivity(userId: string, type: string, props: Record<string, unknown>): Promise<string> {
  const { data, error } = await db().rpc("record_activity", { p_user: userId, p_type: type, p_props: props });
  if (error) throw new RepoError("rpc.record_activity", error.message, error.code);
  return String(data);
}
