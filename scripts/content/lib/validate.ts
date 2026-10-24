import type { SheetConfig } from "../../../content/schema/config";
import {
  CEFR,
  FREQ_RANK_DEFAULT,
  KEY_RE,
  POS,
  SENTENCE_KINDS,
  TAB_COLUMNS,
  type TabKind,
} from "../../../content/schema/constants";
import type {
  DomainRec,
  GrammarRec,
  Issue,
  SentenceRec,
  TabData,
  TopicRec,
  ValidationResult,
  WordRec,
} from "./types";

const isCefr = (s: string) => (CEFR as readonly string[]).includes(s);
const isPos = (s: string) => (POS as readonly string[]).includes(s);
const splitList = (s: string, sep: string) =>
  s.split(sep).map((x) => x.trim()).filter(Boolean);

/**
 * Kiểm tra ĐỊNH DẠNG nội dung (không kiểm tra nghĩa/câu/CEFR đúng hay sai — mục 5.9).
 * Hàm thuần: nhận các tab đã đọc, trả về danh sách lỗi/cảnh báo và dữ liệu đã chuẩn hóa.
 */
export function validateContent(tabs: Map<string, TabData>, cfg: SheetConfig): ValidationResult {
  const issues: Issue[] = [];
  const E = (tab: string, row: number | undefined, code: string, msg: string) =>
    issues.push({ level: "error", tab, row, code, msg });
  const W = (tab: string, row: number | undefined, code: string, msg: string) =>
    issues.push({ level: "warn", tab, row, code, msg });

  /** Kiểm tra cột; trả về false nếu thiếu cột bắt buộc (khi đó bỏ qua kiểm tra từng dòng của tab). */
  const checkColumns = (tab: TabData, kind: TabKind): boolean => {
    const spec = TAB_COLUMNS[kind];
    const have = new Set(tab.headers);
    let ok = true;
    for (const c of spec.required) {
      if (!have.has(c)) {
        E(tab.name, 1, "MISSING_COLUMN", `Thiếu cột bắt buộc "${c}" (hoặc sai tên cột)`);
        ok = false;
      }
    }
    const allowed = new Set<string>([...spec.required, ...spec.optional]);
    for (const h of tab.headers) {
      if (!allowed.has(h)) W(tab.name, 1, "EXTRA_COLUMN", `Cột thừa "${h}" — bị bỏ qua khi nạp`);
    }
    return ok;
  };

  // ---------- sự có mặt của các tab ----------
  const wordTabs = cfg.wordTabs.filter((t) => tabs.has(t.name));
  if (wordTabs.length === 0) {
    E("(tất cả)", undefined, "MISSING_TAB", "Không có tab từ vựng nào (A1…C2)");
  }
  for (const t of cfg.wordTabs) {
    if (!tabs.has(t.name) && wordTabs.length > 0) W(t.name, undefined, "MISSING_TAB", `Không có tab từ vựng "${t.name}"`);
  }
  for (const kind of ["domains", "topics"] as const) {
    const name = cfg.otherTabs[kind].name;
    if (!tabs.has(name)) E(name, undefined, "MISSING_TAB", `Thiếu tab bắt buộc "${name}"`);
  }
  for (const kind of ["sentences", "grammar"] as const) {
    const name = cfg.otherTabs[kind].name;
    if (!tabs.has(name)) W(name, undefined, "MISSING_TAB", `Chưa có tab "${name}"`);
  }

  // ---------- domains ----------
  const domains: DomainRec[] = [];
  const domainCodes = new Set<string>();
  let domainsOk = false;
  const domainTab = tabs.get(cfg.otherTabs.domains.name);
  if (domainTab && checkColumns(domainTab, "domains")) {
    domainsOk = true;
    for (const r of domainTab.rows) {
      const { code, title, emoji } = r.v;
      let bad = false;
      if (!/^[a-z0-9_]+$/.test(code)) {
        E(r.tab, r.row, "BAD_DOMAIN_CODE", `code "${code}" phải viết thường, không dấu, không khoảng trắng`);
        bad = true;
      } else if (domainCodes.has(code)) {
        E(r.tab, r.row, "DUP_DOMAIN", `code "${code}" bị trùng`);
        bad = true;
      }
      if (!title) {
        E(r.tab, r.row, "EMPTY_FIELD", "Thiếu title");
        bad = true;
      }
      if (!bad) {
        domainCodes.add(code);
        domains.push({ code, title, emoji: emoji || null, at: { tab: r.tab, row: r.row } });
      }
    }
    if (!domainCodes.has("general")) {
      E(domainTab.name, undefined, "NO_GENERAL_DOMAIN", 'Thiếu lĩnh vực bắt buộc "general"');
    }
  }

  // ---------- topics ----------
  const topics: TopicRec[] = [];
  const topicSlugs = new Set<string>();
  let topicsOk = false;
  const topicTab = tabs.get(cfg.otherTabs.topics.name);
  if (topicTab && checkColumns(topicTab, "topics")) {
    topicsOk = true;
    for (const r of topicTab.rows) {
      const { slug, title, cefr, domain, emoji, sort } = r.v;
      let bad = false;
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
        E(r.tab, r.row, "BAD_TOPIC_SLUG", `slug "${slug}" phải là chữ thường/số, nối bằng "-"`);
        bad = true;
      } else if (topicSlugs.has(slug)) {
        E(r.tab, r.row, "DUP_TOPIC", `slug "${slug}" bị trùng`);
        bad = true;
      }
      if (!title) {
        E(r.tab, r.row, "EMPTY_FIELD", "Thiếu title");
        bad = true;
      }
      if (!isCefr(cefr)) {
        E(r.tab, r.row, "INVALID_CEFR", `cefr "${cefr}" không hợp lệ`);
        bad = true;
      }
      if (domainsOk && !domainCodes.has(domain)) {
        E(r.tab, r.row, "UNKNOWN_DOMAIN", `domain "${domain}" không có trong tab domains`);
        bad = true;
      }
      if (sort && !/^-?\d+$/.test(sort)) {
        E(r.tab, r.row, "BAD_NUMBER", `sort "${sort}" phải là số nguyên`);
        bad = true;
      }
      if (!bad) {
        topicSlugs.add(slug);
        topics.push({
          slug, title, cefr, domain, emoji: emoji || null,
          sort: sort ? Number(sort) : null, at: { tab: r.tab, row: r.row },
        });
      }
    }
  }

  // ---------- words (mọi tab từ vựng) ----------
  const words: WordRec[] = [];
  const allWordKeys = new Set<string>(); // mọi key đã thấy (kể cả dòng có lỗi khác) — để câu không báo lỗi dây chuyền
  const keyAt = new Map<string, string>();
  const enPos = new Map<string, string>();
  let wordRowCount = 0;

  for (const t of wordTabs) {
    const tab = tabs.get(t.name)!;
    if (!checkColumns(tab, "word")) continue;
    for (const r of tab.rows) {
      wordRowCount++;
      const { key, en, vi, pos, cefr, domain, topics: topicsRaw, rank, ipa } = r.v;
      let bad = false;
      const fail = (code: string, msg: string) => {
        E(r.tab, r.row, code, msg);
        bad = true;
      };

      // key
      if (!key) {
        fail("NO_KEY", "Dòng chưa có key — chạy `npm run content:genkeys` rồi dán vào cột key");
      } else {
        if (!KEY_RE.test(key) || key !== key.toLowerCase()) {
          fail("BAD_KEY", `key "${key}" sai định dạng, cần dạng en:pos:n viết thường (ví dụ slice:v:1)`);
        }
        const first = keyAt.get(key);
        if (first) fail("DUP_KEY", `key "${key}" trùng với ${first}`);
        else keyAt.set(key, `${r.tab} dòng ${r.row}`);
        allWordKeys.add(key);
      }

      if (!en) fail("EMPTY_FIELD", "Thiếu en");
      else if (en.includes(":")) fail("BAD_EN", `en "${en}" không được chứa dấu ":"`);
      if (!vi) fail("EMPTY_FIELD", "Thiếu vi");
      else if (vi.includes(";")) W(r.tab, r.row, "VI_SEMICOLON", `vi chứa ";" — chuyển nghĩa phụ sang vi_alt ("${vi}")`);

      if (!isPos(pos)) fail("INVALID_POS", `pos "${pos}" không nằm trong danh sách (${POS.join(", ")})`);

      if (!isCefr(cefr)) fail("INVALID_CEFR", `cefr "${cefr}" không hợp lệ`);
      else if (cefr !== r.tab) fail("CEFR_TAB_MISMATCH", `cefr "${cefr}" không khớp tên tab "${r.tab}"`);

      if (domainsOk && !domainCodes.has(domain)) {
        fail("UNKNOWN_DOMAIN", `domain "${domain}" không có trong tab domains (chỉ được đúng một giá trị)`);
      }

      const topicList = splitList(topicsRaw, ",");
      if (topicList.length === 0) fail("NO_TOPIC", "Cần ít nhất một chủ đề trong cột topics");
      else if (topicsOk) {
        for (const s of topicList) if (!topicSlugs.has(s)) fail("UNKNOWN_TOPIC", `topic "${s}" không có trong tab topics`);
      }

      if (rank && !/^\d+$/.test(rank)) fail("BAD_NUMBER", `rank "${rank}" phải là số nguyên không âm`);

      if (en && pos) {
        const ep = `${en.toLowerCase()}|${pos}`;
        const first = enPos.get(ep);
        if (first) {
          W(r.tab, r.row, "DUP_EN_POS", `Cùng en + pos với ${first} (hợp lệ nếu khác nghĩa và khác số n trong key)`);
        } else enPos.set(ep, `${r.tab} dòng ${r.row}`);
      }

      if (!bad) {
        words.push({
          key, en, vi,
          viAlt: splitList(r.v.vi_alt ?? "", ";"),
          pos, ipa: ipa || null, cefr, domain, topics: topicList,
          freqRank: rank ? Number(rank) : FREQ_RANK_DEFAULT,
          at: { tab: r.tab, row: r.row },
        });
      }
    }
  }

  // ---------- sentences ----------
  const sentences: SentenceRec[] = [];
  const sentenceTab = tabs.get(cfg.otherTabs.sentences.name);
  const wordsWithSentence = new Set<string>();
  let sentencesOk = false;
  if (sentenceTab && checkColumns(sentenceTab, "sentences")) {
    sentencesOk = true;
    const seenKeys = new Set<string>();
    for (const r of sentenceTab.rows) {
      const { key, en, words: wordsRaw, vi, kind, cefr, source } = r.v;
      let bad = false;
      const fail = (code: string, msg: string) => {
        E(r.tab, r.row, code, msg);
        bad = true;
      };
      if (!key) fail("NO_KEY", "Thiếu key");
      else if (seenKeys.has(key)) fail("DUP_KEY", `key "${key}" bị trùng`);
      else seenKeys.add(key);
      if (!en) fail("EMPTY_FIELD", "Thiếu en");

      const wordKeys = splitList(wordsRaw, ",");
      if (wordKeys.length === 0) fail("NO_WORDS", "Cột words phải liệt kê ít nhất một key từ");
      else if (wordTabs.length > 0) {
        for (const k of wordKeys) if (!allWordKeys.has(k)) fail("UNKNOWN_WORD", `words: key "${k}" không có trong các tab từ vựng`);
      }
      if (kind && !(SENTENCE_KINDS as readonly string[]).includes(kind)) {
        W(r.tab, r.row, "UNKNOWN_KIND", `kind "${kind}" không nằm trong danh sách (${SENTENCE_KINDS.join(", ")})`);
      }
      if (cefr && !isCefr(cefr)) fail("INVALID_CEFR", `cefr "${cefr}" không hợp lệ`);

      if (!bad) {
        for (const k of wordKeys) wordsWithSentence.add(k);
        sentences.push({
          key, en, vi: vi || null, kind: kind || null, cefr: cefr || null, source: source || null,
          words: wordKeys, at: { tab: r.tab, row: r.row },
        });
      }
    }
  }
  if (sentencesOk) {
    for (const w of words) {
      if (!wordsWithSentence.has(w.key)) W(w.at.tab, w.at.row, "NO_SENTENCE", `Từ "${w.en}" (${w.key}) chưa có câu ví dụ nào`);
    }
  }

  // ---------- grammar ----------
  const grammar: GrammarRec[] = [];
  const grammarTab = tabs.get(cfg.otherTabs.grammar.name);
  if (grammarTab && checkColumns(grammarTab, "grammar")) {
    const seenKeys = new Set<string>();
    for (const r of grammarTab.rows) {
      const { key, level, question, options: optRaw, answer: ansRaw, topic, explanation } = r.v;
      let bad = false;
      const fail = (code: string, msg: string) => {
        E(r.tab, r.row, code, msg);
        bad = true;
      };
      if (!key) fail("NO_KEY", "Thiếu key");
      else if (seenKeys.has(key)) fail("DUP_KEY", `key "${key}" bị trùng`);
      else seenKeys.add(key);
      if (!isCefr(level)) fail("INVALID_CEFR", `level "${level}" không hợp lệ`);
      if (!question) fail("EMPTY_FIELD", "Thiếu question");

      const options = splitList(optRaw, "|");
      let answer = 0;
      if (options.length < 2) fail("BAD_OPTIONS", 'options cần ít nhất 2 lựa chọn, ngăn cách bằng "|"');
      else {
        if (new Set(options).size !== options.length) fail("BAD_OPTIONS", "options có lựa chọn trùng nhau");
        if (/^\d+$/.test(ansRaw)) {
          const n = Number(ansRaw);
          if (n >= 1 && n <= options.length) answer = n;
          else fail("BAD_ANSWER", `answer ${n} nằm ngoài khoảng 1…${options.length}`);
        } else if (ansRaw) {
          const i = options.indexOf(ansRaw);
          if (i >= 0) answer = i + 1;
          else fail("BAD_ANSWER", `answer "${ansRaw}" không khớp văn bản của lựa chọn nào`);
        } else fail("BAD_ANSWER", "Thiếu answer");
      }

      if (!bad) {
        grammar.push({
          key, level, topic: topic || null, question, options, answer,
          explanation: explanation || null, at: { tab: r.tab, row: r.row },
        });
      }
    }
  }

  const errorCount = issues.filter((i) => i.level === "error").length;
  return {
    issues,
    errorCount,
    warnCount: issues.length - errorCount,
    data: { words, sentences, grammar, topics, domains },
    wordRowCount,
  };
}
