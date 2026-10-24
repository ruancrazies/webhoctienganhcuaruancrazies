export type FormState = {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
  /** Giá trị đã nhập (không bao giờ chứa mật khẩu) để điền lại khi có lỗi. */
  values?: Record<string, string>;
};
