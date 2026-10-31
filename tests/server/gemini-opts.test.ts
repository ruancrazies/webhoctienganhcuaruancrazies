import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { askGemini } from "../../src/server/chat/gemini";

/** askGemini nhận tuỳ chọn theo từng lời gọi (coach, giải thích lỗi) mà chat vẫn giữ mặc định cũ. */

const ok = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "xin chào" }] } }] }), { status: 200 });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.GEMINI_API_KEY = "k";
  fetchMock = vi.fn().mockImplementation(async () => ok());
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  delete process.env.GEMINI_API_KEY;
  vi.unstubAllGlobals();
});

const sentConfig = () => (JSON.parse(fetchMock.mock.calls[0][1].body as string) as { generationConfig: { temperature: number; maxOutputTokens: number } }).generationConfig;

describe("askGemini: generationConfig", () => {
  it("mặc định như chat cũ (0,5 và 450 token)", async () => {
    await askGemini("sys", [{ role: "user", text: "hi" }]);
    expect(sentConfig()).toEqual({ temperature: 0.5, maxOutputTokens: 450 });
  });
  it("nhận nhiệt độ và trần token riêng", async () => {
    await askGemini("sys", [{ role: "user", text: "hi" }], { temperature: 0.3, maxOutputTokens: 300 });
    expect(sentConfig()).toEqual({ temperature: 0.3, maxOutputTokens: 300 });
  });
  it("khoá API chỉ nằm ở header, không nằm trong URL hay thân yêu cầu", async () => {
    await askGemini("sys", [{ role: "user", text: "hi" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain("k=");
    expect(init.headers["x-goog-api-key"]).toBe("k");
    expect(init.body).not.toContain("\"k\"");
  });
});
