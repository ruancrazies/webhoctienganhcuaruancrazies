import { createAdminClient } from "../db";
import type { Cefr, Passage, PassageBundle, PassageQ, PassageSkill } from "../../core/types";
import { unwrapList } from "./shared";

const db = () => createAdminClient();

type PassageRow = { id: number; key: string; skill: PassageSkill; level: Cefr; title: string; body: string; audio: string | null };
type QuestionRow = { id: number; passage_id: number; kind: "mcq" | "tf"; question: string; options: unknown; answer: number; explanation: string | null; sort: number };

const PASSAGE_COLS = "id,key,skill,level,title,body,audio";
const toPassage = (r: PassageRow): Passage => ({ id: r.id, key: r.key, skill: r.skill, level: r.level, title: r.title, body: r.body, audio: r.audio });

const toQuestion = (r: QuestionRow): PassageQ => ({
  id: r.id,
  passageId: r.passage_id,
  kind: r.kind,
  question: r.question,
  options: Array.isArray(r.options) ? r.options.map(String) : [],
  answer: r.answer,
  explanation: r.explanation,
  sort: r.sort,
});

/**
 * Bốc ngẫu nhiên `n` đoạn của (skill, level) kèm TOÀN BỘ câu hỏi active của đoạn, theo cột `rand`
 * (cùng cách với pickGrammar). Đoạn không có câu hỏi nào bị bỏ qua nên có thể trả ít hơn `n`.
 */
export async function pickPassages(skill: PassageSkill, level: Cefr, n: number, rng: () => number): Promise<PassageBundle[]> {
  if (n <= 0) return [];
  const want = n * 2; // lấy dư vì có đoạn chưa có câu hỏi
  const r = rng();
  const q = () => db().from("passages").select(PASSAGE_COLS).eq("skill", skill).eq("level", level).eq("status", "active").order("rand");
  let rows = unwrapList<PassageRow>("passages.pick", await q().gte("rand", r).limit(want));
  if (rows.length < want) rows = rows.concat(unwrapList<PassageRow>("passages.wrap", await q().lt("rand", r).limit(want - rows.length)));
  if (rows.length === 0) return [];

  const qs = unwrapList<QuestionRow>(
    "passages.questions",
    await db()
      .from("passage_questions")
      .select("id,passage_id,kind,question,options,answer,explanation,sort")
      .in("passage_id", rows.map((p) => p.id))
      .eq("status", "active")
      .order("sort"),
  );
  const byPassage = new Map<number, PassageQ[]>();
  for (const row of qs) byPassage.set(row.passage_id, [...(byPassage.get(row.passage_id) ?? []), toQuestion(row)]);

  return rows
    .map((p) => ({ passage: toPassage(p), questions: byPassage.get(p.id) ?? [] }))
    .filter((b) => b.questions.length > 0)
    .slice(0, n);
}

/** Đoạn văn theo id (kể cả đoạn đã retired: đề đang làm dở vẫn phải hiển thị được). */
export async function passagesByIds(ids: number[]): Promise<Passage[]> {
  if (ids.length === 0) return [];
  return unwrapList<PassageRow>("passages.byIds", await db().from("passages").select(PASSAGE_COLS).in("id", ids)).map(toPassage);
}
