import { buildQuestions, toClientItems, type Pools } from "../../core/questions";
import { GAME_RULES, PLAY_START_PER_HOUR, isGameId } from "../../core/rules";
import type { GrammarQ, Sentence, StoredItem, Word } from "../../core/types";
import type { StartRequest, StartResponse } from "../../types/api";
import { ServiceError } from "../errors";
import { HOUR } from "../limits";
import { hitRateLimit } from "../ratelimit";
import { createRound, distractorPools, pickGrammar, pickWords, resolveScope, sentencesFor } from "../repo";
import { nowOf, rngOf, type Ctx } from "./ctx";
import { requireUnlocked } from "./levels";

const SENTENCES_PER_WORD = 12; // core chọn ngẫu nhiên trong số này
const GRAMMAR_EXTRA = 5; // lấy dư vì có câu ngữ pháp không dựng được (thiếu chỗ trống…)

/** Mục 5.5: kiểm tra mở khóa → chọn từ → dựng câu hỏi + đáp án nhiễu → lưu vòng (kèm đáp án) → trả câu hỏi (không đáp án). */
export async function startRound(req: StartRequest, userId: string, ctx: Ctx = {}): Promise<StartResponse> {
  const now = nowOf(ctx);
  const rng = rngOf(ctx);

  if (!isGameId(req.game)) throw new ServiceError(400, "BAD_GAME", "Trò chơi không hợp lệ");
  const rule = GAME_RULES[req.game];
  if (rule.levelOnly && req.scope.by !== "level") {
    throw new ServiceError(400, "LEVEL_ONLY", "Trò này chỉ chơi theo cấp, không theo chủ đề");
  }

  if (!(await hitRateLimit(`play-start:${userId}`, HOUR, PLAY_START_PER_HOUR))) {
    throw new ServiceError(429, "RATE_LIMITED", "Bạn bắt đầu quá nhiều vòng, hãy nghỉ một chút");
  }

  const scope = await resolveScope(req.scope);
  await requireUnlocked(userId, scope.cefr);

  const n = Math.max(1, Math.min(req.n ?? rule.defaultN, rule.cap));

  let items: StoredItem[];
  let practice = false;

  if (req.game === "tf") {
    // tf không dùng từ: câu ngữ pháp của cấp
    const grammar = await pickGrammar(scope.cefr, n + GRAMMAR_EXTRA, rng);
    items = buildQuestions("tf", [], { grammar }, { rng }).slice(0, n);
  } else {
    const picked = await pickWords(userId, scope, n, req.game === "flash", rng, now);
    practice = picked.practice;
    items = buildQuestions(req.game, picked.words, await buildPools(req.game, picked.words, scope.cefr, rng), { rng });
  }

  if (items.length === 0) {
    throw new ServiceError(409, "NO_CONTENT", "Chưa đủ nội dung để tạo vòng chơi này");
  }

  const { id } = await createRound(userId, req.game, { v: 1, cefr: scope.cefr, practice, items });
  return { roundId: id, items: toClientItems(items), practice };
}

/** Dữ liệu phụ từng trò cần (mục 2c: questions). Trò không cần gì thì không truy vấn thêm. */
async function buildPools(game: StartRequest["game"], words: Word[], cefr: Word["cefr"], rng: () => number): Promise<Pools> {
  const pools: Pools = {};
  const ids = words.map((w) => w.id);

  if (game === "quiz" || game === "blitz" || game === "listen") {
    pools.viDistractors = (await distractorPools(words, rng)).vi;
  } else if (game === "cloze") {
    const [d, sentences] = await Promise.all([distractorPools(words, rng), sentencesFor(ids, SENTENCES_PER_WORD)]);
    pools.enDistractors = d.en;
    pools.sentences = sentences as Record<number, Sentence[]>;
  } else if (game === "build") {
    const [sentences, grammar] = await Promise.all([sentencesFor(ids, SENTENCES_PER_WORD), pickGrammar(cefr, 10, rng)]);
    pools.sentences = sentences as Record<number, Sentence[]>;
    pools.grammar = grammar as GrammarQ[];
  }
  return pools;
}
