import { describe, expect, it } from "vitest";
import { buildSystemPrompt, CHAT_MAX_HISTORY, CHAT_MAX_TURN_CHARS, PET_PERSONA, sanitizeHistory } from "../../src/core/chat";

describe("chat core", () => {
  it("prompt có tên, tính cách và kiến thức", () => {
    const p = buildSystemPrompt("phoebe", "KIẾN-THỨC-X");
    expect(p).toContain(PET_PERSONA.phoebe.name);
    expect(p).toContain(PET_PERSONA.phoebe.style);
    expect(p).toContain("KIẾN-THỨC-X");
    expect(buildSystemPrompt("nuonuo", "k")).not.toContain(PET_PERSONA.phoebe.style);
  });

  it("lịch sử: giữ N tin cuối, bỏ tin rỗng, cắt dài, bắt đầu bằng tin người dùng", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ role: (i % 2 === 0 ? "user" : "pet") as "user" | "pet", text: `m${i}` }));
    const h = sanitizeHistory(many);
    expect(h.length).toBeLessThanOrEqual(CHAT_MAX_HISTORY);
    expect(h[0].role).toBe("user");
    expect(sanitizeHistory([{ role: "pet", text: "hi" }, { role: "user", text: "  " }])).toEqual([]);
    expect(sanitizeHistory([{ role: "user", text: "x".repeat(5000) }])[0].text).toHaveLength(CHAT_MAX_TURN_CHARS);
  });
});
