import { describe, expect, it } from "vitest";
import { BLANK, blankOut, buildQuestions, fillGrammar, inflections, maskWord, renumber, shuffle, toClientItems } from "../../src/core/questions";
import { grammarQ, seeded, sentence, word } from "./helpers";

const apple = word(1, "apple", "quả táo");
const cat = word(2, "cat", "con mèo");
const cook = word(3, "cook", "nấu ăn");

describe("shuffle / maskWord", () => {
  it("shuffle giữ nguyên phần tử và không sửa mảng gốc", () => {
    const a = [1, 2, 3, 4, 5, 6];
    const s = shuffle(a, seeded(7));
    expect([...s].sort()).toEqual(a);
    expect(a).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("maskWord giữ chữ đầu và khoảng trắng", () => {
    expect(maskWord("apple")).toBe("a____");
    expect(maskWord("ice cream")).toBe("i__ c____");
    expect(maskWord("a")).toBe("a");
  });
});

describe("quiz / blitz / listen", () => {
  const pools = { viDistractors: { 1: ["con mèo", "quả táo", "con chó", "cái bàn", "quả cam"] } };

  it("4 đáp án, có đáp án đúng, loại đáp án nhiễu trùng nghĩa đúng", () => {
    const [q] = buildQuestions("quiz", [apple], pools, { rng: seeded(1) });
    expect(q.options).toHaveLength(4);
    expect(q.options).toContain("quả táo");
    expect(new Set(q.options).size).toBe(4);
    expect(q.expected).toBe("quả táo");
    expect(q.prompt).toBe("apple");
    expect(q.part).toBe("vocab");
  });

  it("loại đáp án nhiễu trùng với nghĩa phụ", () => {
    const w = word(1, "apple", "quả táo", { viAlt: ["trái táo"] });
    const [q] = buildQuestions("quiz", [w], { viDistractors: { 1: ["trái táo", "con mèo"] } });
    expect(q.options).not.toContain("trái táo");
  });

  it("không đủ đáp án nhiễu (< 2 lựa chọn) → bỏ từ đó", () => {
    expect(buildQuestions("quiz", [apple], { viDistractors: { 1: ["quả táo"] } })).toEqual([]);
    expect(buildQuestions("quiz", [apple], {})).toEqual([]);
  });

  it("blitz và listen dùng cùng cơ chế, đánh dấu đúng game", () => {
    expect(buildQuestions("blitz", [apple], pools)[0].game).toBe("blitz");
    expect(buildQuestions("listen", [apple], pools)[0].game).toBe("listen");
  });

  it("qid duy nhất và liên tục dù có từ bị bỏ", () => {
    const items = buildQuestions("quiz", [apple, cat, cook], { viDistractors: { 1: ["a", "b"], 3: ["c", "d"] } });
    expect(items.map((i) => i.qid)).toEqual(["q1", "q2"]);
    expect(items.map((i) => i.wordId)).toEqual([1, 3]);
  });
});

describe("toClientItems — không lộ đáp án", () => {
  it("bỏ expected, alts, strict, explanation, meta", () => {
    const items = buildQuestions("quiz", [apple], { viDistractors: { 1: ["a", "b", "c"] } });
    const [c] = toClientItems(items);
    expect(Object.keys(c).sort()).toEqual(["game", "options", "prompt", "qid", "wordId"]);
    expect(JSON.stringify(c)).not.toContain("expected");
  });

  it("gõ từ: gợi ý được gửi (client chỉ hiện khi người chơi bấm) nhưng không có đáp án", () => {
    const [c] = toClientItems(buildQuestions("type", [apple]));
    expect(c.hint).toBe("a____");
    expect(JSON.stringify(c)).not.toContain('"apple"');
  });

  it("flash / match gửi cả hai mặt qua `back`", () => {
    const [f] = toClientItems(buildQuestions("flash", [apple]));
    const [m] = toClientItems(buildQuestions("match", [apple]));
    expect(f).toMatchObject({ prompt: "apple", back: "quả táo" });
    expect(m.back).toBe("quả táo");
  });
});

describe("type", () => {
  it("prompt là nghĩa tiếng Việt, đáp án là từ tiếng Anh", () => {
    const [q] = buildQuestions("type", [apple]);
    expect(q).toMatchObject({ prompt: "quả táo", expected: "apple", hint: "a____" });
  });
  it("hints=false (bài thi) không có gợi ý; strict được ghi vào câu", () => {
    const [q] = buildQuestions("type", [apple], {}, { hints: false, strict: true });
    expect(q.hint).toBeUndefined();
    expect(q.strict).toBe(true);
  });
  it("đồng nghĩa trong cùng vòng được chấp nhận làm đáp án thay thế", () => {
    const big = word(5, "big", "to");
    const large = word(6, "large", "to");
    const items = buildQuestions("type", [big, large, cat]);
    expect(items[0].alts).toEqual(["large"]);
    expect(items[1].alts).toEqual(["big"]);
    expect(items[2].alts).toBeUndefined();
  });
});

describe("scramble", () => {
  it("xáo đúng các chữ cái và khác thứ tự gốc; cụm từ bỏ khoảng trắng", () => {
    const [q] = buildQuestions("scramble", [word(9, "ice cream", "kem")], {}, { rng: seeded(3) });
    expect([...q.tokens!].sort().join("")).toBe([..."icecream"].sort().join(""));
    expect(q.tokens!.join("")).not.toBe("icecream");
    expect(q.expected).toBe("ice cream");
  });
  it("bỏ từ không xáo được (1 ký tự, hoặc toàn chữ giống nhau)", () => {
    expect(buildQuestions("scramble", [word(1, "a", "một"), word(2, "oo", "hai")])).toEqual([]);
  });
});

describe("cloze", () => {
  it("dạng gốc + có đáp án nhiễu → trắc nghiệm, đáp án nằm trong options", () => {
    const [q] = buildQuestions("cloze", [apple], {
      sentences: { 1: [sentence(10, "I eat an apple every day.", "Tôi ăn táo.")] },
      enDistractors: { 1: ["orange", "banana", "grape"] },
    }, { rng: seeded(2) });
    expect(q.prompt).toBe(`I eat an ${BLANK} every day.`);
    expect(q.options).toHaveLength(4);
    expect(q.options).toContain("apple");
    expect(q.expected).toBe("apple");
    expect(q.hint).toBe("Tôi ăn táo.");
    expect(q.sentenceId).toBe(10);
  });

  it("từ ở đầu câu: viết hoa đáp án và đáp án nhiễu để không lộ qua chữ hoa", () => {
    const [q] = buildQuestions("cloze", [apple], {
      sentences: { 1: [sentence(10, "Apple pie is sweet.")] },
      enDistractors: { 1: ["orange", "banana"] },
    });
    expect(q.expected).toBe("Apple");
    expect(q.options!.every((o) => /^[A-Z]/.test(o))).toBe(true);
  });

  it("không có đáp án nhiễu tiếng Anh → chuyển sang gõ", () => {
    const [q] = buildQuestions("cloze", [apple], { sentences: { 1: [sentence(10, "I eat an apple.")] } });
    expect(q.options).toBeUndefined();
    expect(q.expected).toBe("apple");
    expect(q.hint).toBe("quả táo");
  });

  it("dạng biến cách (cooks) → gõ, kèm từ gốc trong ngoặc, đáp án là dạng trong câu", () => {
    const [q] = buildQuestions("cloze", [cook], { sentences: { 3: [sentence(11, "She cooks dinner.")] }, enDistractors: { 3: ["eat"] } });
    expect(q.prompt).toBe(`She ${BLANK} (cook) dinner.`);
    expect(q.options).toBeUndefined();
    expect(q.expected).toBe("cooks");
  });

  it("ưu tiên câu có đúng dạng gốc hơn câu biến cách", () => {
    const [q] = buildQuestions("cloze", [cook], {
      sentences: { 3: [sentence(11, "She cooks dinner."), sentence(12, "I like to cook.")] },
      enDistractors: { 3: ["eat", "run"] },
    }, { rng: seeded(5) });
    expect(q.sentenceId).toBe(12);
    expect(q.options).toBeDefined();
  });

  it("không có câu dùng được → bỏ từ", () => {
    expect(buildQuestions("cloze", [apple], {})).toEqual([]);
    expect(buildQuestions("cloze", [apple], { sentences: { 1: [sentence(1, "I like fruit.")] } })).toEqual([]);
  });

  it("blankOut không khớp một phần của từ khác (cat ≠ category)", () => {
    expect(blankOut("The category is big.", "cat")).toBeNull();
    expect(blankOut("The cat sat.", "cat")?.text).toBe(`The ${BLANK} sat.`);
    expect(blankOut("I love ice  cream.", "ice cream")?.text).toBe(`I love ${BLANK}.`);
  });

  it("inflections", () => {
    expect(inflections("cook")).toContain("cooking");
    expect(inflections("make")).toContain("making");
    expect(inflections("study")).toContain("studies");
    expect(inflections("stop")).toContain("stopped");
    expect(inflections("ice cream")).toEqual([]);
  });
});

describe("build", () => {
  const s = sentence(20, "She is reading a book.", "Cô ấy đang đọc sách.");

  it("tokens là các từ của câu thật, đã xáo, đáp án là thứ tự gốc; prompt là bản dịch", () => {
    const [q] = buildQuestions("build", [apple], { sentences: { 1: [s] } }, { rng: seeded(4) });
    expect(q.expected).toEqual(["She", "is", "reading", "a", "book."]);
    expect([...q.tokens!].sort()).toEqual([...(q.expected as string[])].sort());
    expect(q.tokens!.join(" ")).not.toBe((q.expected as string[]).join(" "));
    expect(q.prompt).toBe("Cô ấy đang đọc sách.");
  });

  it("từ không có câu thì dùng câu ngữ pháp đã điền đáp án đúng; mỗi câu ngữ pháp dùng một lần", () => {
    const g = grammarQ(1, "She ___ a good student.", ["is", "are", "am"], 1);
    const items = buildQuestions("build", [apple, cat], { grammar: [g] });
    expect(items).toHaveLength(1);
    expect(items[0].expected).toEqual(["She", "is", "a", "good", "student."]);
    expect(items[0].grammarId).toBe(1);
  });

  it("bỏ câu quá ngắn / quá dài", () => {
    expect(buildQuestions("build", [apple], { sentences: { 1: [sentence(1, "Hi there.")] } })).toEqual([]);
    expect(buildQuestions("build", [apple], { sentences: { 1: [sentence(2, Array(20).fill("word").join(" "))] } })).toEqual([]);
  });
});

describe("tf / fillGrammar", () => {
  const g = grammarQ(5, "He ___ tea every day.", ["drink", "drinks", "drinking"], 2, "Ngôi thứ ba số ít.");

  it("fillGrammar", () => {
    expect(fillGrammar(g, 1)).toBe("He drinks tea every day.");
    expect(fillGrammar(grammarQ(6, "no blank", ["a", "b"], 1), 0)).toBeNull();
  });

  it("câu đúng ↔ expected 'true'; câu sai ↔ 'false' và dùng đáp án sai", () => {
    const rng = seeded(11);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const [q] = buildQuestions("tf", [], { grammar: [g] }, { rng });
      seen.add(q.expected as string);
      if (q.expected === "true") expect(q.prompt).toBe("He drinks tea every day.");
      else expect(q.prompt).not.toBe("He drinks tea every day.");
      expect(q.explanation).toBe("Ngôi thứ ba số ít.");
    }
    expect(seen).toEqual(new Set(["true", "false"]));
  });

  it("bỏ câu ngữ pháp không có chỗ trống", () => {
    expect(buildQuestions("tf", [], { grammar: [grammarQ(7, "Which is correct?", ["a", "b"], 1)] })).toEqual([]);
  });
});

describe("flash / match / renumber", () => {
  it("một thẻ cho mỗi từ, có cả hai mặt", () => {
    const items = buildQuestions("flash", [apple, cat]);
    expect(items.map((i) => [i.prompt, i.expected])).toEqual([["apple", "quả táo"], ["cat", "con mèo"]]);
  });
  it("renumber", () => {
    const items = renumber(buildQuestions("flash", [apple, cat]).reverse());
    expect(items.map((i) => i.qid)).toEqual(["q1", "q2"]);
  });
});
