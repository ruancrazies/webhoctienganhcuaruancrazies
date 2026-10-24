/** Nội dung mail tiếng Việt cho từng loại hành động của Supabase Auth (mục 5.10). */
export const APP_NAME = "English Game";
export const CODE_VALID_MINUTES = 60; // khớp [auth.email] otp_expiry = 3600 trong supabase/config.toml

export type BuiltMail = { subject: string; html: string };

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const CONTENT: Record<string, { subject: string; heading: string; intro: string; outro: string }> = {
  signup: {
    subject: `Mã xác nhận đăng ký ${APP_NAME}`,
    heading: "Xác nhận email của bạn",
    intro: "Nhập mã dưới đây vào trang xác nhận để hoàn tất đăng ký:",
    outro: "Nếu bạn không đăng ký tài khoản, hãy bỏ qua email này.",
  },
  recovery: {
    subject: `Mã đặt lại mật khẩu ${APP_NAME}`,
    heading: "Đặt lại mật khẩu",
    intro: "Nhập mã dưới đây cùng mật khẩu mới vào trang đặt lại mật khẩu:",
    outro: "Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này — mật khẩu của bạn không thay đổi.",
  },
  magiclink: {
    subject: `Mã đăng nhập ${APP_NAME}`,
    heading: "Mã đăng nhập",
    intro: "Dùng mã dưới đây để đăng nhập:",
    outro: "Nếu bạn không yêu cầu, hãy bỏ qua email này.",
  },
  reauthentication: {
    subject: `Mã xác nhận ${APP_NAME}`,
    heading: "Xác nhận thao tác",
    intro: "Dùng mã dưới đây để xác nhận thao tác của bạn:",
    outro: "Nếu bạn không thực hiện thao tác này, hãy đổi mật khẩu ngay.",
  },
};
CONTENT.email = CONTENT.magiclink;

/** null nếu loại hành động chưa hỗ trợ. Ném lỗi nếu mã không phải chuỗi số. */
export function buildMail(actionType: string, token: string): BuiltMail | null {
  const c = Object.hasOwn(CONTENT, actionType) ? CONTENT[actionType] : undefined;
  if (!c) return null;
  if (!/^\d{4,10}$/.test(token)) throw new Error("Mã xác nhận không hợp lệ");

  const html = `<!doctype html>
<html lang="vi"><body style="margin:0;padding:24px;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px;">
      <tr><td style="font-size:14px;color:#6b7280;">${escapeHtml(APP_NAME)}</td></tr>
      <tr><td style="font-size:22px;font-weight:bold;padding:8px 0 16px;">${escapeHtml(c.heading)}</td></tr>
      <tr><td style="font-size:15px;line-height:1.5;">${escapeHtml(c.intro)}</td></tr>
      <tr><td align="center" style="padding:20px 0;"><span style="display:inline-block;font-size:32px;letter-spacing:8px;font-weight:bold;font-family:Consolas,monospace;background:#eef2ff;color:#3730a3;border-radius:8px;padding:12px 20px;">${escapeHtml(token)}</span></td></tr>
      <tr><td style="font-size:13px;color:#6b7280;line-height:1.5;">Mã có hiệu lực trong ${CODE_VALID_MINUTES} phút. Không chia sẻ mã này với bất kỳ ai.<br>${escapeHtml(c.outro)}</td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  return { subject: c.subject, html };
}
