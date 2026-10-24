import type { Answer, Question } from "@/core/types";

/** Giao diện chung của mọi trò: nhận câu hỏi, trả về danh sách câu trả lời khi xong. Shell lo gọi API. */
export type GameProps = {
  items: Question[];
  onFinish: (answers: Answer[]) => void;
};

/** Giá trị gửi lên khi người chơi bấm "Chưa biết": không khớp đáp án nào nên bị chấm sai (và vào danh sách cần ôn). */
export const DONT_KNOW = "—";

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
