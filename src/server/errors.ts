/**
 * Lỗi nghiệp vụ có mã HTTP. Service ném, Route Handler bắt và trả `toBody()` với `status`.
 * `extra` mang thêm dữ liệu cho client (nextAt, missingWords, attemptsLeft…).
 */
export class ServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ServiceError";
  }

  toBody() {
    return { error: this.message, code: this.code, ...this.extra };
  }
}

export const isServiceError = (e: unknown): e is ServiceError => e instanceof ServiceError;

/** Lỗi truy cập DB (repo). `code` là mã SQLSTATE/PostgREST nếu có (vd "23505" = vi phạm unique). */
export class RepoError extends Error {
  constructor(
    public readonly op: string,
    message: string,
    public readonly code?: string,
  ) {
    super(`${op}: ${message}`);
    this.name = "RepoError";
  }
}

/** RPC của Postgres ném `raise exception '<tag>'` → message chứa tag. */
export const hasTag = (e: unknown, tag: string): boolean => e instanceof Error && e.message.includes(tag);
