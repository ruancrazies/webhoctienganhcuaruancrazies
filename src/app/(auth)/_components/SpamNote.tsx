/** Ghi chú dưới các form có gửi email: thư có thể bị đưa vào mục Thư rác/Spam. */
export function SpamNote({ what = "Thư xác nhận" }: { what?: string }) {
  return (
    <p className="note" role="note">
      <b>Không thấy thư?</b> {what} có thể nằm trong mục <b>Thư rác (Spam)</b> hoặc <b>Quảng cáo/Promotions</b>.
      Hãy kiểm tra các mục đó, và bấm “Không phải thư rác” để lần sau thư vào thẳng hộp thư đến.
    </p>
  );
}
