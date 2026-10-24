/**
 * English Game — webhook gửi mail qua Gmail của chủ dự án (Google Apps Script).
 *
 * Cài đặt (chi tiết ở docs/buoc-3-dang-nhap.md):
 *  1. script.google.com > Dự án mới > dán toàn bộ file này vào Code.gs.
 *  2. Project Settings > Script properties > thêm MAIL_WEBHOOK_SECRET = (cùng giá trị trong .env / Vercel).
 *  3. Chạy hàm `authorize` MỘT LẦN và cấp quyền gửi mail.
 *  4. Deploy > New deployment > Web app: Execute as = Me, Who has access = Anyone.
 *     Dán URL kết thúc bằng /exec vào MAIL_WEBHOOK_URL.
 *
 * Mỗi lần SỬA mã phải Deploy > Manage deployments > Edit > Version: New version thì URL cũ mới dùng mã mới.
 *
 * Lưu ý: Apps Script không đọc được header và không đặt được mã HTTP, nên bí mật nằm trong body
 * và mọi kết quả đều trả HTTP 200 kèm JSON { ok, error? }. Hạn mức Gmail cá nhân: ~100 người nhận/ngày.
 */

var APP_NAME = 'English Game';
var MAX_SUBJECT = 200;
var MAX_HTML = 50000;
var EMAIL_RE = /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[^\s@<>,;"']+$/;

/** Chạy tay một lần để Google hỏi cấp quyền gửi mail. */
function authorize() {
  Logger.log('Còn lại hôm nay: ' + MailApp.getRemainingDailyQuota() + ' mail');
}

/** Mở URL /exec bằng trình duyệt để kiểm tra đã deploy đúng (không lộ thông tin gì). */
function doGet() {
  return ContentService.createTextOutput(APP_NAME + ' mail webhook');
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    var expected = PropertiesService.getScriptProperties().getProperty('MAIL_WEBHOOK_SECRET');
    if (!expected) return reply_(false, 'server_not_configured');
    if (!safeEqual_(String(body.secret || ''), expected)) return reply_(false, 'unauthorized');

    var to = String(body.to || '').trim();
    var subject = String(body.subject || '').replace(/[\r\n]+/g, ' ').trim();
    var html = String(body.html || '');

    if (!EMAIL_RE.test(to) || to.length > 254) return reply_(false, 'invalid_recipient');
    if (!subject || subject.length > MAX_SUBJECT) return reply_(false, 'invalid_subject');
    if (!html || html.length > MAX_HTML) return reply_(false, 'invalid_html');
    if (MailApp.getRemainingDailyQuota() < 1) return reply_(false, 'quota_exceeded');

    MailApp.sendEmail({
      to: to,
      subject: subject,
      htmlBody: html,
      name: APP_NAME,
      noReply: true
    });
    return reply_(true);
  } catch (err) {
    console.error(err);
    return reply_(false, 'exception');
  }
}

function reply_(ok, error) {
  var out = ok ? { ok: true } : { ok: false, error: error };
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** So sánh chuỗi không dừng sớm (giảm rò rỉ độ dài khớp qua thời gian phản hồi). */
function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
