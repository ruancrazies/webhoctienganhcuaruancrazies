/** Giới hạn tần suất của lớp server (đếm trong Postgres, ADR-9). Hằng của core nằm ở core/rules.ts. */
export const LEARN_MARK_PER_HOUR = 60;
export const LEARN_LIST_PER_MINUTE = 120;
export const HOUR = 3600;
export const MINUTE = 60;
export const QUEST_CLAIM_PER_HOUR = 30;
export const DAY = 86400;
export const CHAT_PER_HOUR = 30; // mỗi tin là một lần gọi API trả phí: giữ thấp
export const CHAT_PER_DAY = 100;
export const COACH_PER_DAY = 6; // số lần GỌI Gemini để viết lời nhắn coach mỗi người mỗi ngày (lời nhắn đã cache không tính)
export const EXPLAIN_PER_HOUR = 20; // mỗi lần giải thích lỗi chưa có trong cache là một lần gọi API trả phí
export const EXPLAIN_PER_DAY = 60;
export const COSMETIC_EQUIP_PER_HOUR = 60; // đổi theme/avatar/khung
export const COSMETIC_POLL_PER_HOUR = 240; // trình duyệt hỏi thông báo tối đa mỗi phút một lần mỗi tab
export const EVENT_CLAIM_PER_HOUR = 60; // nhận thưởng nhiệm vụ sự kiện
export const ADMIN_PER_MINUTE = 30; // mọi thao tác của trang quản trị (mỗi admin)
