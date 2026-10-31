import { recordActivity } from "../repo";

/**
 * Ghi một sự kiện hoạt động (activity_events). KHÔNG BAO GIỜ ném lỗi: đây là dữ liệu phụ, hỏng thì chỉ mất một dòng thống kê,
 * không được làm hỏng việc chơi, nộp bài hay nhận thưởng của người dùng.
 *
 * Quy ước `props`: nhỏ và không chứa nội dung riêng tư (không đáp án, không nội dung chat). Chat chỉ ghi `{ pet }`.
 * Loại sự kiện: play/start, play/finish, learn/words, learn/mark, exam/start, exam/submit, test/start, test/submit, quests/claim, chat.
 */
export async function logActivity(userId: string, type: string, props: Record<string, unknown> = {}): Promise<void> {
  try {
    await recordActivity(userId, type, props);
  } catch (e) {
    console.error("[activity]", type, e instanceof Error ? e.message : e);
  }
}
