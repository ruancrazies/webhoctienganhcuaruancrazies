/**
 * Hợp đồng API (mục 5.1): schema Zod kiểm tra request + kiểu response.
 * Không import gì phía server → dùng được ở cả Route Handler lẫn client component.
 */
import { z } from "zod";
import type { QuestId, QuestView } from "../core/quests";
import type { Cefr, LevelStatus, Question, ReviewItem } from "../core/types";

// ---------- request ----------

export const cefrSchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);
export const gameSchema = z.enum(["quiz", "blitz", "type", "scramble", "cloze", "listen", "match", "flash", "build", "tf"]);

/** domain: một `code` (chữ thường/số/_) hoặc "all". */
const domainSchema = z.string().regex(/^[a-z0-9_]{1,40}$/);

export const scopeSchema = z.discriminatedUnion("by", [
  z.object({ by: z.literal("topic"), topicSlug: z.string().min(1).max(80) }),
  z.object({ by: z.literal("level"), cefr: cefrSchema, domain: domainSchema.default("all") }),
]);

export const answerSchema = z.object({
  qid: z.string().min(1).max(20),
  value: z.union([z.string().max(300), z.array(z.string().max(100)).max(40)]),
  hintUsed: z.boolean().optional(),
  attempts: z.number().int().min(0).max(1000).optional(),
});

export const startRequestSchema = z.object({
  game: gameSchema,
  scope: scopeSchema,
  n: z.number().int().min(1).max(100).optional(),
});
export type StartRequest = z.infer<typeof startRequestSchema>;

export const finishRequestSchema = z.object({
  roundId: z.uuid(),
  answers: z.array(answerSchema).max(100),
  /** Giữ cho đúng hợp đồng mục 5.1 nhưng server BỎ QUA: cấp của vòng lấy từ game_rounds. */
  level: cefrSchema.optional(),
});
export type FinishRequest = z.infer<typeof finishRequestSchema>;

/** "new": từ chưa học · "review": từ đã có tiến độ (ôn lại). */
export const learnModeSchema = z.enum(["new", "review"]);
export type LearnMode = z.infer<typeof learnModeSchema>;

export const learnQuerySchema = z.object({
  scope: scopeSchema,
  mode: learnModeSchema.default("new"),
  // "<freq_rank>:<id>" (new) hoặc "<micro-giây>:<id>" (review): số đầu tối đa 16 chữ số
  cursor: z.string().regex(/^\d{1,16}:\d{1,15}$/).optional(),
});
export type LearnQuery = z.infer<typeof learnQuerySchema>;

export const markLearnedSchema = z.object({
  wordIds: z.array(z.number().int().positive()).min(1).max(50),
});
export type MarkLearnedRequest = z.infer<typeof markLearnedSchema>;

export const claimQuestSchema = z.object({ quest: z.enum(["learn", "review", "play", "test", "all"]) });
export type ClaimQuestRequest = z.infer<typeof claimQuestSchema>;

export const practiceStartSchema = z.object({});
export const practiceSubmitSchema = z.object({
  testId: z.uuid(),
  answers: z.array(answerSchema).max(100),
});
export type PracticeSubmitRequest = z.infer<typeof practiceSubmitSchema>;

export const examStartSchema = z.object({ cefr: cefrSchema });
export type ExamStartRequest = z.infer<typeof examStartSchema>;

export const examSubmitSchema = z.object({
  examId: z.uuid(),
  answers: z.array(answerSchema).max(100),
});
export type ExamSubmitRequest = z.infer<typeof examSubmitSchema>;

// ---------- response ----------

export type StartResponse = { roundId: string; items: Question[]; practice: boolean };

export type BoardRow = { username: string; best: number };
export type FinishResponse = {
  xpGained: number;
  xp: number;
  perfect: boolean;
  streak: number;
  review: ReviewItem[];
  newBest?: boolean;
  board?: BoardRow[];
};

export type LearnState = "new" | "learned" | "due" | "mastered";
export type LearnCard = {
  wordId: number;
  key: string;
  en: string;
  pos: string;
  vi: string;
  viAlt: string[];
  ipa?: string | null;
  cefr: Cefr;
  domain: string;
  state: LearnState;
  examples: { en: string; vi?: string | null }[];
};
/** `nextCursor` undefined = đã tới cuối; "Làm mới" khi đó quay lại đầu danh sách. */
export type LearnPage = { items: LearnCard[]; nextCursor?: string; mode: LearnMode };

export type ExamStartResponse = { examId: string; items: Question[]; expiresAt: string; resumed: boolean };
export type ExamResult = {
  passed: boolean;
  scoreTotal: number;
  scoreVocab: number;
  scoreGrammar: number;
  review: ReviewItem[];
  nextAttemptAt?: string;
  attemptsLeftToday: number;
};

export type HomeDomain = { code: string; title: string; emoji?: string | null; total: number; learned: number; mastered: number };
export type HomeTopic = { slug: string; title: string; emoji?: string | null; domain: string; total: number };
export type HomeLevel = LevelStatus & {
  /** Chỉ lĩnh vực general. */
  total: number;
  learned: number;
  mastered: number;
  domains: HomeDomain[];
  topics: HomeTopic[];
};
export type HomeResponse = {
  profile: { username: string; avatar: string | null; xp: number; streak: number; bestStreak: number; xpToday: number; dailyXpCap: number };
  dueCount: number;
  levels: HomeLevel[];
};

/** Nhiệm vụ hôm nay. `bonus` là thưởng hoàn thành cả ba nhiệm vụ cơ bản. */
export type QuestsResponse = { day: number; resetAt: string; quests: QuestView[]; bonus: QuestView };
export type ClaimQuestResponse = { quest: QuestId; reward: number; xp: number };

/** Bài kiểm tra thường xuyên. Không có đạt/không đạt: chỉ hiện điểm. */
export type PracticeStartResponse = { testId: string; items: Question[]; expiresAt: string; resumed: boolean };
export type PracticeResult = {
  scoreTotal: number;
  scoreVocab: number;
  scoreGrammar: number;
  vocabCount: number;
  grammarCount: number;
  review: ReviewItem[];
  /** Số từ làm sai đã được hẹn ôn lại ngay. */
  scheduledReview: number;
  /** Đã tính vào nhiệm vụ "Làm một bài kiểm tra" hôm nay. */
  questCounted: boolean;
  /** Điểm tổng của bài trước (0..1), null nếu đây là bài đầu. */
  previousTotal: number | null;
};
export type PracticeOverview = {
  learnedWords: number;
  minWords: number;
  canStart: boolean;
  /** Đang có bài dở còn hạn (bấm bắt đầu sẽ mở lại đúng bài đó). */
  hasOpen: boolean;
  vocabTotal: number;
  grammarTotal: number;
  durationMinutes: number;
  recent: { finishedAt: string; total: number; vocab: number; grammar: number }[];
};

export type LeaderboardRow = { rank: number; username: string; avatar: string | null; xp: number; level: Cefr | null; isMe: boolean };
export type LeaderboardResponse = { rows: LeaderboardRow[] };
export type BlitzBoardResponse = { cefr: Cefr; rows: BoardRow[] };

/** Mã lỗi nghiệp vụ trả về cho client (xem server/errors.ts). */
export type ApiError = { error: string; code: string } & Record<string, unknown>;
