/** Gọi API của chính ứng dụng từ trình duyệt. Lỗi nghiệp vụ → ApiFail (có `code` và dữ liệu kèm theo). */

export class ApiFail extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiFail";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store" });
  } catch {
    throw new ApiFail(0, "NETWORK", "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
  }

  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    throw new ApiFail(401, "UNAUTHORIZED", "Chưa đăng nhập");
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* không có JSON */
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; code?: string } & Record<string, unknown>;
    const { error, code, ...extra } = d;
    throw new ApiFail(res.status, code ?? "ERROR", error ?? "Có lỗi xảy ra, vui lòng thử lại", extra);
  }
  return data as T;
}

export const apiGet = <T>(url: string) => request<T>(url);
export const apiPost = <T>(url: string, body: unknown) =>
  request<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : "Có lỗi xảy ra, vui lòng thử lại");
