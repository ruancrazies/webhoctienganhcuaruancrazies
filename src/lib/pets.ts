/**
 * Tùy chọn thú cưng nền + kênh "trợ lý" (nhắc nhở/gợi ý). Chỉ là tùy chọn giao diện nên lưu ở localStorage
 * (như tắt âm/giao diện tối). Mặc định BẬT. Một công tắc duy nhất: tắt = ẩn pet và không còn lời nhắc nào.
 *
 * Từ bất kỳ component client nào, muốn thú cưng nói một câu:
 *   import { petSay } from "@/lib/pets";
 *   petSay({ text: "Bạn có 12 từ cần ôn hôm nay!", who: "phoebe", ttl: 8000, id: "due-reviews", once: true });
 * Nếu người dùng đã tắt thú cưng thì lời nhắn bị bỏ qua.
 */
export type PetWho = "nuonuo" | "phoebe";
export type PetMessage = {
  text: string;
  /** Bé nào nói; bỏ trống = ngẫu nhiên. */
  who?: PetWho;
  /** Thời gian hiện bong bóng (ms), mặc định 7000. */
  ttl?: number;
  /** Định danh để chống lặp (dùng cùng `once`). */
  id?: string;
  /** Chỉ nói một lần mỗi phiên trình duyệt (sessionStorage) cho `id` này. */
  once?: boolean;
};

const KEY_PETS = "eg-pets";
const EVENT_PREFS = "eg-pets-change";
export const SAY_EVENT = "eg-pet-say";

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    /* bỏ qua */
  }
  return fallback;
}
function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* bỏ qua */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT_PREFS));
}

export const isPetsOn = (): boolean => readFlag(KEY_PETS, true);
export const setPetsOn = (on: boolean): void => writeFlag(KEY_PETS, on);

export function subscribePets(cb: () => void): () => void {
  window.addEventListener(EVENT_PREFS, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT_PREFS, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Gửi một lời nhắn cho thú cưng nói. An toàn khi gọi ở bất cứ đâu phía client. */
export function petSay(msg: PetMessage): void {
  if (typeof window === "undefined" || !isPetsOn()) return;
  if (msg.once && msg.id) {
    try {
      const k = `eg-pet-seen:${msg.id}`;
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, "1");
    } catch {
      /* không có sessionStorage: vẫn nói */
    }
  }
  window.dispatchEvent(new CustomEvent<PetMessage>(SAY_EVENT, { detail: msg }));
}

/** Mở khung trò chuyện với thú cưng (bấm vào bé hoặc nút 💬 trên thanh trên). `who` bỏ trống = bé đang chọn. */
export const CHAT_OPEN_EVENT = "eg-pet-chat-open";
export function openPetChat(who?: PetWho): void {
  if (typeof window === "undefined" || !isPetsOn()) return;
  window.dispatchEvent(new CustomEvent<{ who?: PetWho }>(CHAT_OPEN_EVENT, { detail: { who } }));
}
