/** Giới hạn tần suất của lớp server (đếm trong Postgres, ADR-9). Hằng của core nằm ở core/rules.ts. */
export const LEARN_MARK_PER_HOUR = 60;
export const LEARN_LIST_PER_MINUTE = 120;
export const HOUR = 3600;
export const MINUTE = 60;
export const QUEST_CLAIM_PER_HOUR = 30;
export const DAY = 86400;
export const CHAT_PER_HOUR = 30; // mỗi tin là một lần gọi API trả phí: giữ thấp
export const CHAT_PER_DAY = 100;
