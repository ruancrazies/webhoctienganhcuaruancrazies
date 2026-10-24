# Bước 3 — Đăng nhập (Supabase Auth + Send Email Hook + Apps Script)

## Luồng

| Trang | Việc |
|---|---|
| `/register` | tên đăng nhập + email + mật khẩu → Supabase gửi mã 6 số (qua hook) → `/verify` |
| `/verify` | nhập mã → đăng nhập luôn; có nút "Gửi lại mã" |
| `/login` | email **hoặc** tên đăng nhập + mật khẩu; tài khoản chưa xác nhận → tự gửi lại mã, chuyển `/verify` |
| `/forgot` → `/reset` | nhập email → nhận mã → nhập mã + mật khẩu mới (đăng xuất các thiết bị khác) |

Mọi thao tác đi qua Server Action (trình duyệt không gọi Supabase Auth trực tiếp) nên có giới hạn tần suất trong bảng `rate_limits`.
Trang `/` hiện chỉ là trang tạm để thấy đã đăng nhập; trang chủ thật ở Bước 5.

## Việc ngoài code (làm theo thứ tự)

### 1. Tạo secret
```
npm run auth:secrets
```
Lưu `SEND_EMAIL_HOOK_SECRET` và `MAIL_WEBHOOK_SECRET` vào `.env.local` (và Vercel sau này).

### 2. Apps Script (gửi mail bằng Gmail của bạn)
1. Vào <https://script.google.com> → Dự án mới → dán toàn bộ `scripts/apps-script/Code.gs`.
2. ⚙ Project Settings → Script properties → thêm `MAIL_WEBHOOK_SECRET` = giá trị ở bước 1.
3. Chọn hàm `authorize` → Run → cấp quyền gửi mail.
4. Deploy → New deployment → loại **Web app** → *Execute as*: **Me**, *Who has access*: **Anyone** → Deploy.
5. Chép URL kết thúc bằng `/exec` vào `MAIL_WEBHOOK_URL`. Mở URL đó bằng trình duyệt: thấy dòng "English Game mail webhook" là đúng.
6. Mỗi lần sửa `Code.gs` phải **Manage deployments → Edit → New version**.

### 3. Supabase
- **Cục bộ:** export `SEND_EMAIL_HOOK_SECRET` rồi chạy `npx supabase start`. `supabase/config.toml` đã bật hook trỏ `http://host.docker.internal:3000/api/auth/send-email`.
- **Bản thật:** Dashboard → Authentication → Hooks → *Send Email* → HTTPS → URL `https://<tên-miền>/api/auth/send-email`, dán Secret ở bước 1 (phải dạng `v1,whsec_...`).
  Bật *Confirm email*; mật khẩu tối thiểu 6; OTP length 6; OTP expiry 3600.
  Authentication → URL Configuration: đặt Site URL và Redirect URLs theo mục 6.5.

### 4. Biến môi trường
Điền `.env.local` theo `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SEND_EMAIL_HOOK_SECRET`, `MAIL_WEBHOOK_URL`, `MAIL_WEBHOOK_SECRET`.
Chưa có `MAIL_WEBHOOK_URL` mà chạy `npm run dev` thì mã được **in ra console** (chỉ khi không phải production) để thử luồng khi chưa cần Gmail.

## Nghiệm thu
- [ ] `npm run typecheck && npm run lint && npm test` xanh
- [ ] Đăng ký → nhận mã qua Gmail thật → nhập mã → vào được trang `/`
- [ ] Đăng xuất → đăng nhập bằng **tên đăng nhập**, rồi bằng **email**
- [ ] Đăng nhập tài khoản chưa xác nhận → được gửi mã mới và chuyển sang `/verify`
- [ ] Quên mật khẩu → nhận mã → đổi mật khẩu → đăng nhập bằng mật khẩu mới
- [ ] Gõ sai mã nhiều lần / bấm gửi lại liên tục → bị chặn bằng thông báo "thao tác quá nhanh"
- [ ] `curl -X POST <url>/api/auth/send-email -d '{}'` trả 401

## Điểm cần biết
- **Supabase chờ hook tối đa 5 giây**, Apps Script đôi khi chậm hơn. Hook chờ mail tối đa 4 giây; quá hạn thì trả 200 và để việc gửi chạy tiếp ở nền (`after`). Nếu lần gửi nền đó lỗi, người dùng không nhận được mã và chỉ có log ở Vercel → họ bấm "Gửi lại mã". Gửi nhanh mà lỗi thì Auth báo lỗi ngay (502).
- Hạn mức Gmail cá nhân ~100 người nhận/ngày. Mỗi email tối đa 5 mail/giờ (chống gửi thư rác tới một địa chỉ). Cần nhiều hơn thì đặt `RESEND_API_KEY` + `RESEND_FROM`.
- Email đã có tài khoản mà đăng ký lại: Supabase trả "thành công giả" và không gửi mã (chống dò email); người dùng sẽ ở trang `/verify` mà không nhận được mã → dùng "Quên mật khẩu".
- Hook hỗ trợ `signup`, `recovery`, `magiclink`/`email`, `reauthentication`. Đổi email và mời người dùng trả 400 vì ứng dụng không dùng.
- `/verify` là trang thêm so với mục 2a (cần cho bước xác nhận bằng mã và cho tài khoản chưa xác nhận).
