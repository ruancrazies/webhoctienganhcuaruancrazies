import "server-only";
import { ServiceError } from "../errors";
import { optionalEnv } from "../env";

export type GeminiMessage = { role: "user" | "model"; text: string };

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const TIMEOUT_MS = 20_000; // đủ ngắn để không vượt giới hạn thời gian của hàm serverless
const MAX_OUTPUT_TOKENS = 450;

type GeminiResponse = { candidates?: { content?: { parts?: { text?: string }[] } }[]; promptFeedback?: { blockReason?: string } };

/** Gọi Gemini (REST) từ server. Khóa API chỉ ở biến môi trường GEMINI_API_KEY, không bao giờ xuống trình duyệt. */
export async function askGemini(system: string, messages: GeminiMessage[]): Promise<string> {
  const key = optionalEnv("GEMINI_API_KEY");
  if (!key) throw new ServiceError(503, "CHAT_UNAVAILABLE", "Trò chuyện chưa được bật");
  const model = optionalEnv("GEMINI_MODEL") ?? DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    generationConfig: { temperature: 0.5, maxOutputTokens: MAX_OUTPUT_TOKENS },
  });

  let lastStatus = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      lastStatus = res.status;
      if (res.ok) {
        const data = (await res.json()) as GeminiResponse;
        const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
        if (text) return text;
        throw new ServiceError(502, "CHAT_EMPTY", "Mình chưa nghĩ ra câu trả lời, bạn hỏi lại theo cách khác nhé");
      }
      if (res.status !== 429 && res.status < 500) break; // lỗi do yêu cầu/khóa: thử lại cũng vô ích
    } catch (e) {
      if (e instanceof ServiceError) throw e;
      // hết giờ / mất mạng: thử lại một lần
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
  }
  console.error("[chat] Gemini lỗi, status", lastStatus); // không ghi nội dung hội thoại hay khóa
  throw new ServiceError(502, "CHAT_FAILED", "Mình đang hơi mệt, bạn thử lại sau ít phút nhé");
}
