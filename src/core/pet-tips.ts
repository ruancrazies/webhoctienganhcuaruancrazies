/** Nội dung lời nhắc/gợi ý của thú cưng trợ lý. Thuần hàm, không phụ thuộc trình duyệt (dễ kiểm thử). */

/** Nhắc nghỉ sau chừng này phút học liên tục (tính thời gian tab đang hiển thị). */
export const BREAK_AFTER_MIN = 25;

/** Lời chào theo giờ trong ngày (0–23). */
export function greetingFor(hour: number, name?: string): string {
  const who = name ? `, ${name}` : "";
  if (hour >= 5 && hour < 11) return `Chào buổi sáng${who}! Học vài từ mới cho tỉnh táo nhé?`;
  if (hour >= 11 && hour < 14) return `Buổi trưa rồi${who}. Ôn nhanh vài từ trước khi nghỉ nha!`;
  if (hour >= 14 && hour < 18) return `Chiều tốt lành${who}! Mình cùng luyện tiếp nhé?`;
  if (hour >= 18 && hour < 23) return `Tối rồi${who}. Ôn lại từ cũ một chút trước khi ngủ sẽ nhớ lâu hơn đó!`;
  return `Khuya rồi${who}... ngủ sớm để não kịp ghi nhớ bài nha.`;
}

export function breakReminder(minutes: number): string {
  return `Bạn đã học ${minutes} phút rồi. Nghỉ mắt và uống ngụm nước nhé!`;
}

/** Mẹo học ngắn (dùng cho gợi ý ngẫu nhiên về sau). */
export const STUDY_TIPS: readonly string[] = [
  "Ôn từ cũ mỗi ngày hiệu quả hơn học dồn một lần.",
  "Đọc to từ mới và đặt một câu của riêng bạn để nhớ lâu hơn.",
  "Sai không sao — những câu sai chính là chỗ bạn tiến bộ nhiều nhất.",
];
